<?php
/**
 * Rox Taxi — shared library.
 *
 *   • Config loader (reads ~/rox.env)
 *   • PDO connection (cached across requests within one PHP-FPM worker)
 *   • JWT helpers  (HS256, matches FastAPI's `jwt.encode`)
 *   • bcrypt admin auth
 *   • JSON response, HttpException
 *   • Notifications (Twilio SMS + SMTP email via built-in mail() with headers)
 *   • cURL helper for external APIs (Stripe / PayPal / Emergent LLM)
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

// ─── Config loader ────────────────────────────────────────────────────
final class Config {
    private static array $env = [];

    public static function load(): void {
        if (self::$env) return;
        // Look for rox.env one level above public_html (Namecheap layout).
        $candidates = [
            dirname(__DIR__, 3) . '/rox.env',   // ~/rox.env when api lives in ~/public_html/api
            dirname(__DIR__, 2) . '/rox.env',
            __DIR__ . '/rox.env',               // dev fallback
            __DIR__ . '/../../.env',            // repo dev
        ];
        foreach ($candidates as $p) {
            if (is_readable($p)) {
                foreach (file($p, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                    $line = trim($line);
                    if ($line === '' || $line[0] === '#') continue;
                    [$k, $v] = array_pad(explode('=', $line, 2), 2, '');
                    self::$env[trim($k)] = trim(trim($v), "\"'");
                }
                return;
            }
        }
    }

    public static function get(string $key, ?string $default = null): ?string {
        self::load();
        return self::$env[$key] ?? getenv($key) ?: $default;
    }
}
Config::load();

// ─── Errors as clean HTTP responses ───────────────────────────────────
final class HttpException extends \RuntimeException {
    public function __construct(public int $status, string $message = '') {
        parent::__construct($message);
    }
}
function http_error(int $status, string $msg): never { throw new HttpException($status, $msg); }
function json_response(mixed $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}
function read_json_body(): array {
    $raw  = file_get_contents('php://input') ?: '';
    if ($raw === '') return [];
    $data = json_decode($raw, true);
    if (!is_array($data)) http_error(400, 'Malformed JSON body');
    return $data;
}
function require_field(array $body, string ...$keys): void {
    foreach ($keys as $k) if (!isset($body[$k])) http_error(400, "Missing field: $k");
}

// ─── DB (PDO + prepared-statement helpers) ────────────────────────────
function db(): \PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $host = Config::get('DB_HOST', 'localhost');
    $db   = Config::get('DB_NAME');
    $user = Config::get('DB_USER');
    $pass = Config::get('DB_PASS');
    if (!$db) http_error(500, 'DB not configured');
    $pdo  = new \PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass, [
        \PDO::ATTR_ERRMODE            => \PDO::ERRMODE_EXCEPTION,
        \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
        \PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    return $pdo;
}
function db_all(string $sql, array $params = []): array {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}
function db_one(string $sql, array $params = []): ?array {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $row  = $stmt->fetch();
    return $row === false ? null : $row;
}
function db_exec(string $sql, array $params = []): int {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

// Coerce a MySQL row into the JSON shape the React frontend expects.
// - `active` / `featured` become booleans
// - JSON columns become nested arrays
// - numeric columns become floats/ints
function shape_row(array $row, array $bool = [], array $json = [], array $num = []): array {
    foreach ($bool as $k)  if (isset($row[$k])) $row[$k] = (bool)(int)$row[$k];
    foreach ($json as $k)  if (isset($row[$k])) $row[$k] = $row[$k] ? json_decode($row[$k], true) : null;
    foreach ($num as $k)   if (isset($row[$k])) $row[$k] = is_null($row[$k]) ? null : (float)$row[$k];
    return $row;
}

function now_iso(): string {
    return (new \DateTime('now', new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.uP');
}
function uuid_hex(int $len = 12): string {
    return bin2hex(random_bytes(max(1, (int)ceil($len / 2))));
}

// ─── JWT (HS256) ──────────────────────────────────────────────────────
function jwt_encode(array $claims, ?string $secret = null): string {
    $secret ??= Config::get('JWT_SECRET') ?: 'insecure-dev-secret';
    $b64 = fn($x) => rtrim(strtr(base64_encode($x), '+/', '-_'), '=');
    $head = $b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $body = $b64(json_encode($claims));
    $sig  = $b64(hash_hmac('sha256', "$head.$body", $secret, true));
    return "$head.$body.$sig";
}
function jwt_decode(string $token, ?string $secret = null): array {
    $secret ??= Config::get('JWT_SECRET') ?: 'insecure-dev-secret';
    [$h, $b, $s] = array_pad(explode('.', $token), 3, '');
    if (!$h || !$b || !$s) http_error(401, 'Malformed token');
    $b64d = fn($x) => base64_decode(strtr($x, '-_', '+/'));
    $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', "$h.$b", $secret, true)), '+/', '-_'), '=');
    if (!hash_equals($expected, $s)) http_error(401, 'Invalid token');
    $claims = json_decode($b64d($b), true);
    if (!is_array($claims)) http_error(401, 'Invalid claims');
    if (isset($claims['exp']) && time() > (int)$claims['exp']) http_error(401, 'Token expired');
    return $claims;
}
function require_admin(): string {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!str_starts_with($auth, 'Bearer ')) http_error(401, 'Missing token');
    $claims = jwt_decode(substr($auth, 7));
    if (($claims['role'] ?? '') !== 'admin') http_error(403, 'Admins only');
    return (string)($claims['sub'] ?? '');
}
function optional_customer(): ?array {
    $token = $_COOKIE['session_token'] ?? '';
    if (!$token) {
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($auth, 'Bearer ')) $token = substr($auth, 7);
    }
    if (!$token) return null;
    $sess = db_one('SELECT * FROM user_sessions WHERE session_token = ? LIMIT 1', [$token]);
    if (!$sess) return null;
    if (strtotime($sess['expires_at']) < time()) return null;
    return db_one('SELECT * FROM users WHERE user_id = ? LIMIT 1', [$sess['user_id']]);
}
function require_customer(): array {
    $u = optional_customer();
    if (!$u) http_error(401, 'Not authenticated');
    return $u;
}

// ─── Notifications ────────────────────────────────────────────────────
function send_sms(string $to, string $body): array {
    $sid   = Config::get('TWILIO_ACCOUNT_SID');
    $token = Config::get('TWILIO_AUTH_TOKEN');
    $from  = Config::get('TWILIO_FROM_NUMBER');
    if (!$sid || !$token || !$from) return ['ok' => false, 'skipped' => true, 'reason' => 'twilio_not_configured'];
    $url = "https://api.twilio.com/2010-04-01/Accounts/$sid/Messages.json";
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERPWD => "$sid:$token",
        CURLOPT_POSTFIELDS => http_build_query(['To' => $to, 'From' => $from, 'Body' => $body]),
        CURLOPT_TIMEOUT => 15,
    ]);
    $out  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['ok' => $code >= 200 && $code < 300, 'status' => $code, 'response' => json_decode((string)$out, true)];
}
function send_email(string $to, string $subject, string $html, string $text = ''): array {
    // Basic SMTP submission via native mail() with SMTP configured in php.ini.
    // For Namecheap Private Email, mail() works because Stellar accepts local
    // SMTP relay. For SendGrid switch to their HTTPS API here.
    $from_email = Config::get('SMTP_FROM_EMAIL') ?: 'no-reply@roxtaxi.com';
    $from_name  = Config::get('SMTP_FROM_NAME')  ?: 'Rox Taxi Service and Tours';
    $boundary   = 'roxtx-' . uuid_hex(8);
    $headers    = [
        "From: $from_name <$from_email>",
        "Reply-To: $from_email",
        "MIME-Version: 1.0",
        "Content-Type: multipart/alternative; boundary=\"$boundary\"",
    ];
    $body  = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" . ($text ?: strip_tags($html)) . "\r\n";
    $body .= "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n$html\r\n--$boundary--\r\n";
    $ok    = mail($to, $subject, $body, implode("\r\n", $headers));
    return ['ok' => (bool)$ok];
}
function notify_booking_confirmed(array $b, array $cfg): array {
    $rep     = ['sms' => null, 'email' => null, 'admin_email' => null];
    $summary = "Rox Taxi booking {$b['id']} confirmed — {$b['item_name']}, $" . number_format((float)$b['total'], 2)
             . ", payment: {$b['payment_method']}, date: {$b['booking_date']}.";
    if (!empty($cfg['notify_sms_enabled'])) {
        $rep['sms'] = send_sms($b['customer_phone'], $summary);
    }
    if (!empty($cfg['notify_email_enabled'])) {
        $rep['email'] = send_email(
            $b['customer_email'],
            "Booking confirmed — {$b['id']}",
            "<h2>Thanks {$b['customer_name']}!</h2><p>$summary</p>",
            $summary,
        );
        $admin = Config::get('ADMIN_EMAIL');
        if ($admin) $rep['admin_email'] = send_email($admin, "New booking {$b['id']}", "<pre>$summary</pre>", $summary);
    }
    return $rep;
}

// ─── cURL wrapper for external APIs ───────────────────────────────────
function http_json(string $method, string $url, ?array $body = null, array $headers = []): array {
    $ch = curl_init($url);
    $opts = [
        CURLOPT_CUSTOMREQUEST  => strtoupper($method),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_HTTPHEADER     => array_merge(['Accept: application/json'], $headers),
    ];
    if ($body !== null) {
        $opts[CURLOPT_POSTFIELDS] = json_encode($body);
        $opts[CURLOPT_HTTPHEADER][] = 'Content-Type: application/json';
    }
    curl_setopt_array($ch, $opts);
    $raw    = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err    = curl_error($ch);
    curl_close($ch);
    if ($raw === false) http_error(502, "Upstream error: $err");
    $data = json_decode((string)$raw, true);
    return ['status' => $status, 'data' => is_array($data) ? $data : ['raw' => $raw]];
}
