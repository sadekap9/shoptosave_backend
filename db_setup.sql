-- SQL Script to setup the database tables
-- Verified with current DB schema

CREATE DATABASE IF NOT EXISTS shop2save;
USE shop2save;

CREATE TABLE IF NOT EXISTS user_master (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(15) NOT NULL UNIQUE,
    dob VARCHAR(20),
    role TINYINT DEFAULT 3,
    profile_image VARCHAR(300),
    otp VARCHAR(6),
    is_active TINYINT DEFAULT 1,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modifiedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_master (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    access_token VARCHAR(300) NOT NULL,
    refresh_token VARCHAR(300) NOT NULL,
    platform VARCHAR(10) NOT NULL,
    device_token VARCHAR(250),
    ip_address VARCHAR(45),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modifiedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user_master(id) ON DELETE CASCADE
);
