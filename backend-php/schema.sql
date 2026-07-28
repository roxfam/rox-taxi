-- ═══════════════════════════════════════════════════════════════════════
--  Rox Taxi Service and Tours — MySQL schema (Namecheap Stellar / MariaDB)
--  Import this once via phpMyAdmin → Import.
-- ═══════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ─── Users (Google-authed customers) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  user_id      VARCHAR(32) PRIMARY KEY,
  email        VARCHAR(255) NOT NULL UNIQUE,
  name         VARCHAR(255) DEFAULT NULL,
  picture      VARCHAR(500) DEFAULT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_sessions (
  session_token VARCHAR(128) PRIMARY KEY,
  user_id       VARCHAR(32) NOT NULL,
  expires_at    DATETIME NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_us_user (user_id),
  KEY idx_us_exp  (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Catalog: tours, rentals, taxi_services ────────────────────────────
-- We keep three tables (rather than one polymorphic `catalog`) because the
-- shape diverges too much (rentals have seats/year/make; tours have
-- duration/location; taxi has route). Common metadata columns are shared
-- but each table owns its own extras.
CREATE TABLE IF NOT EXISTS tours (
  id                    VARCHAR(64) PRIMARY KEY,
  name                  VARCHAR(255) NOT NULL,
  description           TEXT,
  price                 DECIMAL(9,2) NOT NULL,
  seed_price            DECIMAL(9,2) DEFAULT NULL,
  duration              VARCHAR(64)  DEFAULT NULL,
  location              VARCHAR(255) DEFAULT NULL,
  featured              TINYINT(1) NOT NULL DEFAULT 0,
  category              VARCHAR(64)  DEFAULT NULL,
  image_url             VARCHAR(1000) DEFAULT NULL,
  external_booking_url  VARCHAR(1000) DEFAULT NULL,
  active                TINYINT(1) NOT NULL DEFAULT 1,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tours_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rentals (
  id            VARCHAR(64) PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  price         DECIMAL(9,2) NOT NULL,
  seed_price    DECIMAL(9,2) DEFAULT NULL,
  seats         INT DEFAULT NULL,
  year          INT DEFAULT NULL,
  make          VARCHAR(64) DEFAULT NULL,
  model         VARCHAR(64) DEFAULT NULL,
  color         VARCHAR(64) DEFAULT NULL,
  body          VARCHAR(64) DEFAULT NULL,
  category      VARCHAR(64) DEFAULT NULL,
  image_url     VARCHAR(1000) DEFAULT NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS taxi_services (
  id            VARCHAR(64) PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  price         DECIMAL(9,2) NOT NULL,
  seed_price    DECIMAL(9,2) DEFAULT NULL,
  route         VARCHAR(255) DEFAULT NULL,
  featured      TINYINT(1) NOT NULL DEFAULT 0,
  image_url     VARCHAR(1000) DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Home page hero slides ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS home_slides (
  id           VARCHAR(64) PRIMARY KEY,
  title        VARCHAR(255) DEFAULT NULL,
  subtitle     VARCHAR(500) DEFAULT NULL,
  image_url    VARCHAR(1000) NOT NULL,
  `order`      INT NOT NULL DEFAULT 0,
  active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Site config (single row keyed by "main") ───────────────────────────
CREATE TABLE IF NOT EXISTS site_config (
  id                    VARCHAR(32) PRIMARY KEY,
  phone                 VARCHAR(64)  DEFAULT NULL,
  whatsapp_number       VARCHAR(64)  DEFAULT NULL,
  facebook_url          VARCHAR(500) DEFAULT NULL,
  messenger_url         VARCHAR(500) DEFAULT NULL,
  tripadvisor_url       VARCHAR(500) DEFAULT NULL,
  paypal_me_url         VARCHAR(500) DEFAULT NULL,
  zelle_email           VARCHAR(255) DEFAULT NULL,
  zelle_phone           VARCHAR(64)  DEFAULT NULL,
  logo_url              VARCHAR(500) DEFAULT NULL,
  notify_email_enabled  TINYINT(1) NOT NULL DEFAULT 1,
  notify_sms_enabled    TINYINT(1) NOT NULL DEFAULT 1,
  extra_json            JSON DEFAULT NULL,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Price history (per catalog item) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS price_history (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_kind    ENUM('tours','rentals','taxi') NOT NULL,
  item_id      VARCHAR(64) NOT NULL,
  price        DECIMAL(9,2) NOT NULL,
  old_price    DECIMAL(9,2) DEFAULT NULL,
  is_promo     TINYINT(1) NOT NULL DEFAULT 0,
  note         VARCHAR(500) DEFAULT NULL,
  changed_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ph_item (item_kind, item_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Bookings (core transactional table) ───────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                     VARCHAR(16) PRIMARY KEY,
  service_type           ENUM('taxi','tour','rental') NOT NULL,
  item_id                VARCHAR(64) NOT NULL,
  item_name              VARCHAR(255) NOT NULL,
  price                  DECIMAL(9,2) NOT NULL,
  customer_name          VARCHAR(255) NOT NULL,
  customer_email         VARCHAR(255) NOT NULL,
  customer_phone         VARCHAR(64)  NOT NULL,
  booking_date           VARCHAR(32)  NOT NULL,
  pickup_location        VARCHAR(500) DEFAULT NULL,
  dropoff_location       VARCHAR(500) DEFAULT NULL,
  passengers             INT NOT NULL DEFAULT 1,
  days                   INT NOT NULL DEFAULT 1,
  extra_luggage          INT NOT NULL DEFAULT 0,
  additional_drivers     INT NOT NULL DEFAULT 0,
  notes                  TEXT,
  payment_method         VARCHAR(32) NOT NULL,
  status                 VARCHAR(32) NOT NULL DEFAULT 'confirmed',
  payment_status         VARCHAR(32) NOT NULL DEFAULT 'pending',
  luggage_fee            DECIMAL(9,2) NOT NULL DEFAULT 0,
  passenger_fee          DECIMAL(9,2) NOT NULL DEFAULT 0,
  deposit_amount         DECIMAL(9,2) NOT NULL DEFAULT 0,
  deposit_status         VARCHAR(32) DEFAULT NULL,
  additional_driver_fee  DECIMAL(9,2) NOT NULL DEFAULT 0,
  total                  DECIMAL(9,2) NOT NULL DEFAULT 0,
  driver_id              VARCHAR(64) DEFAULT NULL,
  driver_name            VARCHAR(255) DEFAULT NULL,
  driver_phone           VARCHAR(64) DEFAULT NULL,
  cancellation_json      JSON DEFAULT NULL,
  notification_status    JSON DEFAULT NULL,
  notified_at            DATETIME DEFAULT NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_book_email  (customer_email),
  KEY idx_book_status (status),
  KEY idx_book_item   (service_type, item_id),
  KEY idx_book_date   (booking_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Contact form & group inquiries ────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_messages (
  id           VARCHAR(16) PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  email        VARCHAR(255) NOT NULL,
  phone        VARCHAR(64)  DEFAULT NULL,
  subject      VARCHAR(255) DEFAULT NULL,
  message      TEXT NOT NULL,
  status       VARCHAR(32) NOT NULL DEFAULT 'new',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS group_inquiries (
  id                VARCHAR(16) PRIMARY KEY,
  event_type        VARCHAR(64)  NOT NULL,
  event_date        VARCHAR(32)  NOT NULL,
  guest_count       INT NOT NULL,
  needs_json        JSON DEFAULT NULL,
  budget_range      VARCHAR(64) DEFAULT NULL,
  customer_name     VARCHAR(255) NOT NULL,
  customer_email    VARCHAR(255) NOT NULL,
  customer_phone    VARCHAR(64)  NOT NULL,
  notes             TEXT,
  package_json      JSON DEFAULT NULL,
  estimated_total   DECIMAL(9,2) DEFAULT NULL,
  status            VARCHAR(32) NOT NULL DEFAULT 'new',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Driver GPS pings (retained ~24h, cron prunes) ─────────────────────
CREATE TABLE IF NOT EXISTS driver_pings (
  booking_id   VARCHAR(16) PRIMARY KEY,
  lat          DECIMAL(10,7) NOT NULL,
  lng          DECIMAL(10,7) NOT NULL,
  accuracy_m   DECIMAL(9,2) DEFAULT NULL,
  heading      DECIMAL(6,2) DEFAULT NULL,
  speed_mps    DECIMAL(6,2) DEFAULT NULL,
  ping_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Payments ledger ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                VARCHAR(32) PRIMARY KEY,
  booking_id        VARCHAR(16) NOT NULL,
  provider          VARCHAR(32) NOT NULL,     -- stripe | paypal | zelle
  provider_txn_id   VARCHAR(128) DEFAULT NULL,
  amount            DECIMAL(9,2) NOT NULL,
  currency          VARCHAR(8)  NOT NULL DEFAULT 'USD',
  status            VARCHAR(32) NOT NULL DEFAULT 'pending',
  raw_json          JSON DEFAULT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pay_book (booking_id),
  KEY idx_pay_prov (provider, provider_txn_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Chat message log ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id   VARCHAR(64) NOT NULL,
  role         VARCHAR(16) NOT NULL,          -- user | assistant
  text         TEXT NOT NULL,
  ts           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_chat_sess (session_id, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ─── Initial site_config row ───────────────────────────────────────────
INSERT INTO site_config (id, phone, whatsapp_number, facebook_url, notify_email_enabled, notify_sms_enabled)
VALUES ('main', '+1 (242) 432-2587', '+12424322587', 'https://www.facebook.com/roxtaxiservice/', 1, 1)
ON DUPLICATE KEY UPDATE id = id;
