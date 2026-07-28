<?php
/**
 * Rox Taxi Service and Tours — PHP 8 front controller.
 *
 * Every /api/* request lands here (see api/.htaccess). We normalise the URL,
 * pick the handler module, and dispatch. Handlers return an array which we
 * JSON-encode. Uncaught exceptions become clean HTTP errors.
 */
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

// ── CORS pre-flight ────────────────────────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Route dispatch ─────────────────────────────────────────────────────
try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $uri    = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    // strip leading "/api" — matches FastAPI's `api_router = APIRouter(prefix="/api")`
    if (str_starts_with($uri, '/api/')) $uri = substr($uri, 4);
    if ($uri === '/api')                $uri = '/';
    $uri = rtrim($uri, '/') ?: '/';

    // Route table — first entry that matches wins. Order is important:
    // literal routes must come BEFORE their `{param}` siblings.
    $routes = [
        // ── Root ────────────────────────────────────────────────────────
        ['GET',  '#^/$#',                                          fn() => ['service' => 'Rox Taxi Service and Tours Bahamas API', 'status' => 'running', 'focus' => 'Nassau & Paradise Island']],

        // ── Auth ────────────────────────────────────────────────────────
        ['POST', '#^/auth/login$#',                                'auth_login'],
        ['POST', '#^/auth/session$#',                              'auth_google_session'],
        ['GET',  '#^/auth/me$#',                                   'auth_me'],
        ['POST', '#^/auth/logout$#',                               'auth_logout'],
        ['GET',  '#^/my/bookings$#',                               'auth_my_bookings'],

        // ── Public catalog ──────────────────────────────────────────────
        ['GET',  '#^/tours$#',                                     'catalog_list_tours'],
        ['GET',  '#^/taxi-services$#',                             'catalog_list_taxi'],
        ['GET',  '#^/rentals$#',                                   'catalog_list_rentals'],
        ['GET',  '#^/rentals/([^/]+)/availability$#',              'catalog_rental_availability'],
        ['GET',  '#^/gallery$#',                                   'catalog_gallery'],
        ['GET',  '#^/home-slides$#',                               'catalog_home_slides'],
        ['GET',  '#^/site-config$#',                               'site_get_config'],
        ['GET',  '#^/reviews$#',                                   'site_reviews'],
        ['GET',  '#^/fees$#',                                      'site_fees'],

        // ── Bookings ────────────────────────────────────────────────────
        ['POST', '#^/bookings$#',                                  'bookings_create'],
        ['GET',  '#^/bookings/([^/]+)$#',                          'bookings_get'],
        ['POST', '#^/bookings/([^/]+)/cancel$#',                   'bookings_cancel'],
        ['GET',  '#^/bookings/([^/]+)/driver-location$#',          'tracking_get'],
        ['GET',  '#^/bookings/([^/]+)/receipt\.pdf$#',             'bookings_receipt_pdf'],
        ['POST', '#^/drivers/location$#',                          'tracking_ping'],

        // ── Contact / group inquiries / wedding PDF ─────────────────────
        ['POST', '#^/contact$#',                                   'site_contact'],
        ['POST', '#^/group-inquiries$#',                           'site_group_inquiry'],
        ['GET',  '#^/wedding-package/([^/]+)/quote\.pdf$#',        'site_wedding_pdf'],

        // ── Chat (proxy to Emergent LLM, blocking) ──────────────────────
        ['POST', '#^/chat/stream$#',                               'site_chat_send'],
        ['GET',  '#^/chat/history/([^/]+)$#',                      'site_chat_history'],

        // ── Uploads (static — served by .htaccess when file exists) ─────
        ['GET',  '#^/uploads/([^/]+)$#',                           'admin_upload_get'],
        ['POST', '#^/admin/upload$#',                              'admin_upload_post'],
        ['POST', '#^/admin/logo/upload$#',                         'admin_logo_upload'],
        ['GET',  '#^/admin/images$#',                              'admin_list_images'],
        ['DELETE','#^/admin/images/([^/]+)$#',                     'admin_delete_image'],

        // ── Admin: bookings mgmt ────────────────────────────────────────
        ['GET',  '#^/admin/bookings$#',                            'admin_list_bookings'],
        ['GET',  '#^/admin/bookings/([^/]+)$#',                    'admin_get_booking'],
        ['PATCH','#^/admin/bookings/([^/]+)$#',                    'admin_update_booking'],
        ['POST', '#^/admin/bookings/([^/]+)/notify$#',             'admin_notify_booking'],
        ['POST', '#^/admin/bookings/([^/]+)/refund-deposit$#',     'admin_refund_deposit'],

        // ── Admin: catalog CRUD ─────────────────────────────────────────
        ['GET',   '#^/admin/(tours|rentals|taxi)$#',               'admin_list_catalog'],
        ['POST',  '#^/admin/catalog/(tours|rentals|taxi)$#',       'admin_create_catalog'],
        ['PUT',   '#^/admin/(tours|rentals|taxi)/([^/]+)$#',       'admin_update_catalog'],
        ['DELETE','#^/admin/(tours|rentals|taxi)/([^/]+)$#',       'admin_delete_catalog'],
        ['PATCH', '#^/admin/(tours|rentals|taxi)/([^/]+)/price$#', 'admin_patch_price'],
        ['GET',   '#^/admin/(tours|rentals|taxi)/([^/]+)/price-history$#', 'admin_price_history'],

        // ── Admin: site config ──────────────────────────────────────────
        ['GET',   '#^/admin/site-config$#',                        'admin_get_site_config'],
        ['PATCH', '#^/admin/site-config$#',                        'admin_patch_site_config'],
        ['GET',   '#^/admin/home-slides$#',                        'admin_list_home_slides'],
        ['POST',  '#^/admin/home-slides$#',                        'admin_create_home_slide'],
        ['PUT',   '#^/admin/home-slides/([^/]+)$#',                'admin_update_home_slide'],
        ['DELETE','#^/admin/home-slides/([^/]+)$#',                'admin_delete_home_slide'],

        // ── Admin: contact & group inquiries ───────────────────────────
        ['GET',  '#^/admin/contact-messages$#',                    'admin_list_contact'],
        ['GET',  '#^/admin/group-inquiries$#',                     'admin_list_group_inquiries'],
        ['PATCH','#^/admin/group-inquiries/([^/]+)$#',             'admin_update_group_inquiry'],

        // ── Payments ────────────────────────────────────────────────────
        ['POST', '#^/payments/stripe/checkout$#',                  'pay_stripe_checkout'],
        ['GET',  '#^/payments/stripe/status/([^/]+)$#',            'pay_stripe_status'],
        ['POST', '#^/payments/stripe/webhook$#',                   'pay_stripe_webhook'],
        ['POST', '#^/payments/paypal/create$#',                    'pay_paypal_create'],
        ['POST', '#^/payments/paypal/capture$#',                   'pay_paypal_capture'],
        ['POST', '#^/payments/zelle/mark-paid$#',                  'pay_zelle_mark'],
    ];

    require_once __DIR__ . '/routes/catalog.php';
    require_once __DIR__ . '/routes/bookings.php';
    require_once __DIR__ . '/routes/auth.php';
    require_once __DIR__ . '/routes/site.php';
    require_once __DIR__ . '/routes/admin.php';
    require_once __DIR__ . '/routes/payments.php';

    foreach ($routes as [$m, $pattern, $handler]) {
        if ($m !== $method) continue;
        if (!preg_match($pattern, $uri, $args)) continue;
        array_shift($args); // full match
        $result = is_callable($handler) ? $handler(...$args) : call_user_func($handler, ...$args);
        json_response($result);
        exit;
    }

    http_response_code(404);
    echo json_encode(['detail' => "Not Found: $method $uri"]);
} catch (HttpException $e) {
    http_response_code($e->status);
    echo json_encode(['detail' => $e->getMessage()]);
} catch (\Throwable $e) {
    error_log('[rox api] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    echo json_encode(['detail' => 'Internal server error', 'error' => $e->getMessage()]);
}
