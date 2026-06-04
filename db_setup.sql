-- SQL Script to setup the database tables
-- Generated from active database schema

CREATE DATABASE IF NOT EXISTS shoptosave;
USE shoptosave;

CREATE TABLE "app_config" (
  "config_key" varchar(100) NOT NULL,
  "config_value" longtext,
  "description" varchar(255) DEFAULT NULL,
  "modifiedAt" datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY ("config_key")
);

CREATE TABLE "categories" (
  "id" int NOT NULL AUTO_INCREMENT,
  "category_name" varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "logo" varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "status" tinyint DEFAULT '1',
  "created_at" datetime DEFAULT CURRENT_TIMESTAMP,
  "updated_at" datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE "failed_login_attempts" (
  "id" bigint NOT NULL AUTO_INCREMENT,
  "identity" varchar(100) NOT NULL,
  "ip_address" varchar(45) NOT NULL,
  "attempt_type" varchar(10) NOT NULL,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  KEY "idx_failed_attempts" ("identity","created_at"),
  KEY "idx_ip_attempts" ("ip_address","created_at")
);

CREATE TABLE "otp_master" (
  "id" bigint NOT NULL AUTO_INCREMENT,
  "phone" varchar(15) NOT NULL,
  "otp_hash" varchar(255) NOT NULL,
  "purpose" varchar(20) NOT NULL DEFAULT 'login',
  "attempts" tinyint NOT NULL DEFAULT '0',
  "expires_at" timestamp NOT NULL,
  "is_verified" tinyint NOT NULL DEFAULT '0',
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  KEY "idx_otp_phone" ("phone","is_verified","expires_at")
);

CREATE TABLE "session_master" (
  "id" bigint NOT NULL AUTO_INCREMENT,
  "user_id" int NOT NULL,
  "access_token" varchar(500) NOT NULL,
  "refresh_token" varchar(500) NOT NULL,
  "device_token" varchar(255) DEFAULT NULL,
  "device_name" varchar(100) DEFAULT NULL,
  "platform" varchar(10) NOT NULL,
  "ip_address" varchar(45) NOT NULL,
  "is_revoked" tinyint NOT NULL DEFAULT '0',
  "expires_at" timestamp NOT NULL,
  "last_active_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  KEY "idx_session_token" ("access_token"(255)),
  KEY "idx_session_refresh" ("refresh_token"(255)),
  KEY "idx_user_sessions" ("user_id","is_revoked"),
  CONSTRAINT "session_master_ibfk_1" FOREIGN KEY ("user_id") REFERENCES "user_master" ("id") ON DELETE CASCADE
);

CREATE TABLE "stores" (
  "id" int NOT NULL AUTO_INCREMENT,
  "store_name" varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  "logo" varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "category_id" int DEFAULT NULL,
  "status" tinyint NOT NULL DEFAULT '1',
  "created_at" datetime DEFAULT CURRENT_TIMESTAMP,
  "updated_at" datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  KEY "st_fk_cat_id_idx" ("category_id"),
  CONSTRAINT "st_fk_cat_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id")
);

CREATE TABLE "user_devices" (
  "id" bigint NOT NULL AUTO_INCREMENT,
  "user_id" int NOT NULL,
  "device_token" varchar(255) NOT NULL,
  "device_name" varchar(100) DEFAULT NULL,
  "platform" varchar(10) NOT NULL,
  "last_active_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  "created_at" timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE KEY "uk_user_device" ("user_id","device_token"),
  CONSTRAINT "user_devices_ibfk_1" FOREIGN KEY ("user_id") REFERENCES "user_master" ("id") ON DELETE CASCADE
);

CREATE TABLE "user_master" (
  "id" int NOT NULL AUTO_INCREMENT,
  "name" varchar(20) DEFAULT NULL,
  "email" varchar(50) DEFAULT NULL,
  "phone" varchar(15) DEFAULT NULL,
  "password" varchar(255) DEFAULT NULL,
  "dob" varchar(20) DEFAULT NULL,
  "role" tinyint DEFAULT '2',
  "menu_access" json DEFAULT NULL,
  "profile_image" varchar(300) DEFAULT NULL,
  "otp" varchar(6) DEFAULT NULL,
  "is_active" tinyint DEFAULT '1',
  "createdAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modifiedAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE KEY "uk_phone" ("phone"),
  UNIQUE KEY "uk_email" ("email"),
  KEY "idx_role" ("role"),
  KEY "idx_is_active" ("is_active"),
  KEY "idx_createdAt" ("createdAt")
);

CREATE TABLE "woohoo_categories" (
  "id" int NOT NULL AUTO_INCREMENT,
  "woohoo_category_id" int NOT NULL,
  "parent_id" int DEFAULT NULL,
  "name" varchar(255) NOT NULL,
  "url_slug" varchar(255) DEFAULT NULL,
  "description" text,
  "short_description" text,
  "canonical_url" varchar(500) DEFAULT NULL,
  "color_code" varchar(20) DEFAULT NULL,
  "bg_color_code" varchar(20) DEFAULT NULL,
  "offer_description" text,
  "meta_index" varchar(100) DEFAULT NULL,
  "meta_keyword" text,
  "page_title" varchar(255) DEFAULT NULL,
  "meta_description" text,
  "image_url" text,
  "thumbnail_url" text,
  "sub_category_filter" tinyint(1) DEFAULT '0',
  "subcategories_count" int DEFAULT '0',
  "is_active" tinyint(1) DEFAULT '1',
  "synced_at" datetime DEFAULT CURRENT_TIMESTAMP,
  "createdAt" datetime DEFAULT CURRENT_TIMESTAMP,
  "modifiedAt" datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE KEY "uk_woohoo_category" ("woohoo_category_id")
);

CREATE TABLE "woohoo_products" (
  "id" int NOT NULL AUTO_INCREMENT,
  "category_id" int NOT NULL,
  "sku" varchar(100) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "product_type" varchar(20) DEFAULT NULL,
  "price_type" varchar(20) DEFAULT NULL,
  "min_price" decimal(12,2) DEFAULT NULL,
  "max_price" decimal(12,2) DEFAULT NULL,
  "denominations" varchar(10) DEFAULT NULL,
  "currency_code" varchar(10) DEFAULT NULL,
  "currency_symbol" varchar(10) DEFAULT NULL,
  "currency_numeric_code" varchar(10) DEFAULT NULL,
  "url_key" varchar(255) DEFAULT NULL,
  "offer_short_desc" text,
  "promo_available" tinyint(1) DEFAULT '0',
  "designs_available" tinyint(1) DEFAULT '0',
  "related_available" tinyint(1) DEFAULT '0',
  "image_thumbnail" text,
  "image_mobile" text,
  "image_base" text,
  "image_small" text,
  "brand_logo" text,
  "emi_applicable" tinyint(1) DEFAULT '0',
  "tnc_link" text,
  "tnc_content" longtext,
  "expiry_info" varchar(255) DEFAULT NULL,
  "kyc_enabled" tinyint(1) DEFAULT '0',
  "balance_enquiry_instruction" text,
  "special_instruction" text,
  "reload_card_number" tinyint(1) DEFAULT '0',
  "is_active" tinyint(1) DEFAULT '1',
  "is_3pd" tinyint(1) DEFAULT '0',
  "synced_at" datetime DEFAULT CURRENT_TIMESTAMP,
  "createdAt" datetime DEFAULT CURRENT_TIMESTAMP,
  "modifiedAt" datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  KEY "idx_category_id" ("category_id"),
  CONSTRAINT "fk_wp_category" FOREIGN KEY ("category_id") REFERENCES "woohoo_categories" ("id") ON DELETE CASCADE
);

