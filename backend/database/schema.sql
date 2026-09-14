-- =============================================================================
-- Viora MySQL schema (Phase 2)
-- Source of truth mapped from packages/social-core/supabase/migrations/001–016
-- Engine: InnoDB | Charset: utf8mb4 | PKs: CHAR(36) UUID
-- Auth: local `users` table replaces Supabase auth.users
-- Apply locally (Laragon): mysql -u root -e "CREATE DATABASE IF NOT EXISTS viora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
--                         mysql -u root viora < backend/database/schema.sql
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Auth (replaces Supabase auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified_at DATETIME(6) NULL,
  mfa_enabled TINYINT(1) NOT NULL DEFAULT 0,
  mfa_secret VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  user_agent VARCHAR(512) NULL,
  ip_hint VARCHAR(64) NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY auth_sessions_user_id_idx (user_id),
  KEY auth_sessions_expires_at_idx (expires_at),
  CONSTRAINT auth_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_otps (
  id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME(6) NOT NULL,
  consumed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY password_reset_otps_email_idx (email),
  KEY password_reset_otps_expires_at_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL,
  username VARCHAR(64) NULL,
  display_name VARCHAR(255) NOT NULL DEFAULT '',
  bio TEXT NULL,
  avatar_url TEXT NULL,
  cover_url TEXT NULL,
  website TEXT NULL,
  location VARCHAR(255) NULL,
  date_of_birth DATE NULL,
  gender VARCHAR(64) NULL,
  is_private TINYINT(1) NOT NULL DEFAULT 0,
  is_deactivated TINYINT(1) NOT NULL DEFAULT 0,
  tag_review_enabled TINYINT(1) NOT NULL DEFAULT 0,
  follower_count INT NOT NULL DEFAULT 0,
  following_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY profiles_username_unique (username),
  KEY profiles_username_idx (username),
  CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id CHAR(36) NOT NULL,
  language VARCHAR(8) NOT NULL DEFAULT 'en',
  hide_sensitive TINYINT(1) NOT NULL DEFAULT 0,
  login_alerts TINYINT(1) NOT NULL DEFAULT 1,
  reduce_motion TINYINT(1) NOT NULL DEFAULT 0,
  theme_preference VARCHAR(16) NOT NULL DEFAULT 'system',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  CONSTRAINT user_settings_language_check CHECK (language IN ('en','es','fr','de','hi','pt')),
  CONSTRAINT user_settings_theme_check CHECK (theme_preference IN ('system','light','dark')),
  CONSTRAINT user_settings_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_events (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  ip_hint VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  device_label VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY login_events_user_created_idx (user_id, created_at),
  CONSTRAINT login_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_log (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  action VARCHAR(64) NOT NULL,
  metadata JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY activity_log_user_created_idx (user_id, created_at),
  CONSTRAINT activity_log_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_export_requests (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  download_path TEXT NULL,
  error_message TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY data_export_requests_user_created_idx (user_id, created_at),
  CONSTRAINT data_export_requests_status_check CHECK (status IN ('pending','processing','ready','failed')),
  CONSTRAINT data_export_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY account_deletion_requests_user_created_idx (user_id, created_at),
  CONSTRAINT account_deletion_requests_status_check CHECK (status IN ('pending','processing','completed','failed')),
  CONSTRAINT account_deletion_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Social graph
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS follows (
  id CHAR(36) NOT NULL,
  follower_id CHAR(36) NOT NULL,
  following_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY follows_follower_following_unique (follower_id, following_id),
  KEY follows_follower_id_idx (follower_id),
  KEY follows_following_id_idx (following_id),
  CONSTRAINT follows_no_self CHECK (follower_id <> following_id),
  CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS friend_requests (
  id CHAR(36) NOT NULL,
  from_user_id CHAR(36) NOT NULL,
  to_user_id CHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY friend_requests_from_to_unique (from_user_id, to_user_id),
  KEY friend_requests_from_user_id_idx (from_user_id),
  KEY friend_requests_to_user_id_idx (to_user_id),
  KEY friend_requests_status_idx (status),
  KEY friend_requests_from_to_status_idx (from_user_id, to_user_id, status),
  CONSTRAINT friend_requests_no_self CHECK (from_user_id <> to_user_id),
  CONSTRAINT friend_requests_status_check CHECK (status IN ('pending','accepted','rejected')),
  CONSTRAINT friend_requests_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT friend_requests_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS friendships (
  id CHAR(36) NOT NULL,
  user_a CHAR(36) NOT NULL,
  user_b CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY friendships_user_a_user_b_unique (user_a, user_b),
  KEY friendships_user_a_idx (user_a),
  KEY friendships_user_b_idx (user_b),
  CONSTRAINT friendships_ordered_pair CHECK (user_a < user_b),
  CONSTRAINT friendships_user_a_fkey FOREIGN KEY (user_a) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT friendships_user_b_fkey FOREIGN KEY (user_b) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS follow_requests (
  id CHAR(36) NOT NULL,
  from_user_id CHAR(36) NOT NULL,
  to_user_id CHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY follow_requests_from_to_unique (from_user_id, to_user_id),
  KEY follow_requests_to_user_id_idx (to_user_id),
  KEY follow_requests_from_user_id_idx (from_user_id),
  KEY follow_requests_status_idx (status),
  CONSTRAINT follow_requests_no_self CHECK (from_user_id <> to_user_id),
  CONSTRAINT follow_requests_status_check CHECK (status IN ('pending','accepted','rejected')),
  CONSTRAINT follow_requests_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT follow_requests_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blocked_users (
  id CHAR(36) NOT NULL,
  blocker_id CHAR(36) NOT NULL,
  blocked_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY blocked_users_unique (blocker_id, blocked_id),
  KEY blocked_users_blocked_id_idx (blocked_id),
  KEY blocked_users_blocker_id_idx (blocker_id),
  CONSTRAINT blocked_users_no_self CHECK (blocker_id <> blocked_id),
  CONSTRAINT blocked_users_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT blocked_users_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_mutes (
  id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  target_id CHAR(36) NOT NULL,
  scope VARCHAR(16) NOT NULL DEFAULT 'all',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY user_mutes_owner_target_unique (owner_id, target_id),
  KEY user_mutes_owner_id_idx (owner_id),
  KEY user_mutes_target_id_idx (target_id),
  CONSTRAINT user_mutes_no_self CHECK (owner_id <> target_id),
  CONSTRAINT user_mutes_scope_check CHECK (scope IN ('posts','stories','all')),
  CONSTRAINT user_mutes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT user_mutes_target_id_fkey FOREIGN KEY (target_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_restricts (
  id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  target_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY user_restricts_owner_target_unique (owner_id, target_id),
  KEY user_restricts_owner_id_idx (owner_id),
  KEY user_restricts_target_id_idx (target_id),
  CONSTRAINT user_restricts_no_self CHECK (owner_id <> target_id),
  CONSTRAINT user_restricts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT user_restricts_target_id_fkey FOREIGN KEY (target_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_snoozes (
  id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  target_id CHAR(36) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY user_snoozes_owner_target_unique (owner_id, target_id),
  KEY user_snoozes_owner_id_idx (owner_id),
  KEY user_snoozes_expires_at_idx (expires_at),
  CONSTRAINT user_snoozes_no_self CHECK (owner_id <> target_id),
  CONSTRAINT user_snoozes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT user_snoozes_target_id_fkey FOREIGN KEY (target_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS close_friends (
  id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  friend_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY close_friends_owner_friend_unique (owner_id, friend_id),
  KEY close_friends_owner_id_idx (owner_id),
  KEY close_friends_friend_id_idx (friend_id),
  CONSTRAINT close_friends_no_self CHECK (owner_id <> friend_id),
  CONSTRAINT close_friends_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT close_friends_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feed_favorites (
  id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  target_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY feed_favorites_owner_target_unique (owner_id, target_id),
  KEY feed_favorites_owner_id_idx (owner_id),
  KEY feed_favorites_target_id_idx (target_id),
  CONSTRAINT feed_favorites_no_self CHECK (owner_id <> target_id),
  CONSTRAINT feed_favorites_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT feed_favorites_target_id_fkey FOREIGN KEY (target_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audience_lists (
  id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY audience_lists_owner_id_idx (owner_id),
  CONSTRAINT audience_lists_name_not_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT audience_lists_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audience_list_members (
  id CHAR(36) NOT NULL,
  list_id CHAR(36) NOT NULL,
  member_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY audience_list_members_list_member_unique (list_id, member_id),
  KEY audience_list_members_list_id_idx (list_id),
  KEY audience_list_members_member_id_idx (member_id),
  CONSTRAINT audience_list_members_list_id_fkey FOREIGN KEY (list_id) REFERENCES audience_lists (id) ON DELETE CASCADE,
  CONSTRAINT audience_list_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Posts / engagement
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  body TEXT NOT NULL DEFAULT (''),
  like_count INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  share_count INT NOT NULL DEFAULT 0,
  save_count INT NOT NULL DEFAULT 0,
  view_count INT NOT NULL DEFAULT 0,
  repost_count INT NOT NULL DEFAULT 0,
  visibility VARCHAR(16) NOT NULL DEFAULT 'public',
  publish_status VARCHAR(16) NOT NULL DEFAULT 'published',
  scheduled_at DATETIME(6) NULL,
  location_name VARCHAR(255) NULL,
  feeling VARCHAR(64) NULL,
  pinned_at DATETIME(6) NULL,
  archived_at DATETIME(6) NULL,
  edited_at DATETIME(6) NULL,
  comments_disabled TINYINT(1) NOT NULL DEFAULT 0,
  is_sensitive TINYINT(1) NOT NULL DEFAULT 0,
  repost_of_id CHAR(36) NULL,
  deleted_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY posts_author_id_idx (author_id),
  KEY posts_created_at_idx (created_at),
  KEY posts_deleted_at_idx (deleted_at),
  KEY posts_visibility_idx (visibility),
  KEY posts_publish_status_idx (publish_status),
  KEY posts_scheduled_at_idx (scheduled_at),
  KEY posts_pinned_at_idx (pinned_at),
  KEY posts_archived_at_idx (archived_at),
  KEY posts_repost_of_id_idx (repost_of_id),
  CONSTRAINT posts_visibility_check CHECK (visibility IN ('public','followers','friends','only_me','custom')),
  CONSTRAINT posts_publish_status_check CHECK (publish_status IN ('draft','published','scheduled')),
  CONSTRAINT posts_scheduled_requires_at CHECK (publish_status <> 'scheduled' OR scheduled_at IS NOT NULL),
  CONSTRAINT posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT posts_repost_of_id_fkey FOREIGN KEY (repost_of_id) REFERENCES posts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS post_media (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  url TEXT NOT NULL,
  media_type VARCHAR(16) NOT NULL DEFAULT 'image',
  sort_order INT NOT NULL DEFAULT 0,
  width INT NULL,
  height INT NULL,
  alt_text TEXT NULL,
  duration_seconds DECIMAL(10,3) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY post_media_post_id_idx (post_id, sort_order),
  CONSTRAINT post_media_media_type_check CHECK (media_type IN ('image','video')),
  CONSTRAINT post_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS post_likes (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY post_likes_post_user_unique (post_id, user_id),
  KEY post_likes_user_id_idx (user_id),
  KEY post_likes_post_id_idx (post_id),
  CONSTRAINT post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS post_reactions (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  reaction VARCHAR(16) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY post_reactions_post_user_unique (post_id, user_id),
  KEY post_reactions_post_id_idx (post_id),
  KEY post_reactions_user_id_idx (user_id),
  CONSTRAINT post_reactions_reaction_check CHECK (reaction IN ('love','haha','wow','sad','angry')),
  CONSTRAINT post_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT post_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comments (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  parent_id CHAR(36) NULL,
  body TEXT NOT NULL,
  like_count INT NOT NULL DEFAULT 0,
  pinned_at DATETIME(6) NULL,
  deleted_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY comments_post_id_idx (post_id, created_at),
  KEY comments_parent_id_idx (parent_id),
  KEY comments_author_id_idx (author_id),
  KEY comments_pinned_at_idx (pinned_at),
  CONSTRAINT comments_body_not_empty CHECK (CHAR_LENGTH(TRIM(body)) > 0),
  CONSTRAINT comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES comments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comment_likes (
  id CHAR(36) NOT NULL,
  comment_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY comment_likes_comment_user_unique (comment_id, user_id),
  KEY comment_likes_user_id_idx (user_id),
  CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES comments (id) ON DELETE CASCADE,
  CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comment_keyword_filters (
  id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  keyword VARCHAR(128) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY comment_keyword_filters_owner_keyword_unique (owner_id, keyword),
  CONSTRAINT comment_keyword_filters_keyword_not_empty CHECK (CHAR_LENGTH(TRIM(keyword)) > 0),
  CONSTRAINT comment_keyword_filters_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_collections (
  id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY saved_collections_owner_id_idx (owner_id),
  CONSTRAINT saved_collections_name_not_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT saved_collections_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_posts (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  collection_id CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY saved_posts_user_post_unique (user_id, post_id),
  KEY saved_posts_post_id_idx (post_id),
  KEY saved_posts_collection_id_idx (collection_id),
  CONSTRAINT saved_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT saved_posts_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT saved_posts_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES saved_collections (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS post_shares (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  target VARCHAR(16) NOT NULL DEFAULT 'external',
  conversation_id CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY post_shares_post_id_idx (post_id),
  KEY post_shares_user_id_idx (user_id),
  CONSTRAINT post_shares_target_check CHECK (target IN ('link','feed','dm','external')),
  CONSTRAINT post_shares_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT post_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hidden_posts (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY hidden_posts_user_post_unique (user_id, post_id),
  CONSTRAINT hidden_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT hidden_posts_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS post_audience (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  list_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY post_audience_post_list_unique (post_id, list_id),
  CONSTRAINT post_audience_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT post_audience_list_id_fkey FOREIGN KEY (list_id) REFERENCES audience_lists (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS post_tags (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  tagged_user_id CHAR(36) NOT NULL,
  tagged_by CHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY post_tags_post_user_unique (post_id, tagged_user_id),
  KEY post_tags_tagged_user_id_idx (tagged_user_id),
  CONSTRAINT post_tags_status_check CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT post_tags_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT post_tags_tagged_user_id_fkey FOREIGN KEY (tagged_user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT post_tags_tagged_by_fkey FOREIGN KEY (tagged_by) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS post_revisions (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  body TEXT NOT NULL DEFAULT (''),
  edited_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY post_revisions_post_id_idx (post_id),
  CONSTRAINT post_revisions_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT post_revisions_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS post_views (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  viewer_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY post_views_post_viewer_unique (post_id, viewer_id),
  CONSTRAINT post_views_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT post_views_viewer_id_fkey FOREIGN KEY (viewer_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hashtags (
  id CHAR(36) NOT NULL,
  tag VARCHAR(128) NOT NULL,
  post_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY hashtags_tag_unique (tag),
  KEY hashtags_post_count_idx (post_count),
  CONSTRAINT hashtags_tag_not_empty CHECK (CHAR_LENGTH(TRIM(tag)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS post_hashtags (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  hashtag_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY post_hashtags_post_hashtag_unique (post_id, hashtag_id),
  KEY post_hashtags_hashtag_id_idx (hashtag_id),
  CONSTRAINT post_hashtags_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT post_hashtags_hashtag_id_fkey FOREIGN KEY (hashtag_id) REFERENCES hashtags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Stories / reels (before messages.story_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stories (
  id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  audience VARCHAR(32) NOT NULL DEFAULT 'public',
  expires_at DATETIME(6) NOT NULL,
  deleted_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY stories_author_id_idx (author_id),
  KEY stories_expires_at_idx (expires_at),
  KEY stories_audience_idx (audience),
  CONSTRAINT stories_audience_check CHECK (audience IN ('public','close_friends')),
  CONSTRAINT stories_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS story_media (
  id CHAR(36) NOT NULL,
  story_id CHAR(36) NOT NULL,
  url TEXT NOT NULL,
  media_type VARCHAR(16) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  stickers JSON NOT NULL DEFAULT (JSON_ARRAY()),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY story_media_story_id_idx (story_id, sort_order),
  CONSTRAINT story_media_media_type_check CHECK (media_type IN ('image','video')),
  CONSTRAINT story_media_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS story_views (
  id CHAR(36) NOT NULL,
  story_id CHAR(36) NOT NULL,
  viewer_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY story_views_story_viewer_unique (story_id, viewer_id),
  CONSTRAINT story_views_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories (id) ON DELETE CASCADE,
  CONSTRAINT story_views_viewer_id_fkey FOREIGN KEY (viewer_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS story_sticker_responses (
  id CHAR(36) NOT NULL,
  story_media_id CHAR(36) NOT NULL,
  sticker_id VARCHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  response JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY story_sticker_responses_unique (story_media_id, sticker_id, user_id),
  CONSTRAINT story_sticker_responses_story_media_id_fkey FOREIGN KEY (story_media_id) REFERENCES story_media (id) ON DELETE CASCADE,
  CONSTRAINT story_sticker_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS story_highlights (
  id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  cover_url TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY story_highlights_owner_id_idx (owner_id),
  CONSTRAINT story_highlights_title_not_empty CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT story_highlights_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS story_highlight_items (
  id CHAR(36) NOT NULL,
  highlight_id CHAR(36) NOT NULL,
  source_story_id CHAR(36) NULL,
  url TEXT NOT NULL,
  media_type VARCHAR(16) NOT NULL,
  stickers JSON NOT NULL DEFAULT (JSON_ARRAY()),
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY story_highlight_items_highlight_id_idx (highlight_id, sort_order),
  CONSTRAINT story_highlight_items_media_type_check CHECK (media_type IN ('image','video')),
  CONSTRAINT story_highlight_items_highlight_id_fkey FOREIGN KEY (highlight_id) REFERENCES story_highlights (id) ON DELETE CASCADE,
  CONSTRAINT story_highlight_items_source_story_id_fkey FOREIGN KEY (source_story_id) REFERENCES stories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reels (
  id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  caption TEXT NOT NULL DEFAULT (''),
  like_count INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  view_count INT NOT NULL DEFAULT 0,
  audio_title VARCHAR(255) NULL,
  audio_artist VARCHAR(255) NULL,
  audio_url TEXT NULL,
  comments_disabled TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY reels_author_id_idx (author_id),
  KEY reels_created_at_idx (created_at),
  CONSTRAINT reels_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reel_media (
  id CHAR(36) NOT NULL,
  reel_id CHAR(36) NOT NULL,
  url TEXT NOT NULL,
  media_type VARCHAR(16) NOT NULL DEFAULT 'video',
  thumbnail_url TEXT NULL,
  duration_seconds DECIMAL(10,3) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY reel_media_reel_id_idx (reel_id, sort_order),
  CONSTRAINT reel_media_media_type_check CHECK (media_type IN ('image','video')),
  CONSTRAINT reel_media_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES reels (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reel_likes (
  id CHAR(36) NOT NULL,
  reel_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY reel_likes_reel_user_unique (reel_id, user_id),
  KEY reel_likes_user_id_idx (user_id),
  CONSTRAINT reel_likes_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES reels (id) ON DELETE CASCADE,
  CONSTRAINT reel_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reel_comments (
  id CHAR(36) NOT NULL,
  reel_id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  parent_id CHAR(36) NULL,
  body TEXT NOT NULL,
  like_count INT NOT NULL DEFAULT 0,
  deleted_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY reel_comments_reel_id_idx (reel_id, created_at),
  KEY reel_comments_parent_id_idx (parent_id),
  KEY reel_comments_author_id_idx (author_id),
  CONSTRAINT reel_comments_body_not_empty CHECK (CHAR_LENGTH(TRIM(body)) > 0),
  CONSTRAINT reel_comments_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES reels (id) ON DELETE CASCADE,
  CONSTRAINT reel_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT reel_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES reel_comments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reel_saves (
  id CHAR(36) NOT NULL,
  reel_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY reel_saves_reel_user_unique (reel_id, user_id),
  KEY reel_saves_user_id_idx (user_id),
  CONSTRAINT reel_saves_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES reels (id) ON DELETE CASCADE,
  CONSTRAINT reel_saves_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) NOT NULL,
  is_group TINYINT(1) NOT NULL DEFAULT 0,
  is_request TINYINT(1) NOT NULL DEFAULT 0,
  title VARCHAR(255) NULL,
  last_message_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY conversations_is_request_idx (is_request),
  KEY conversations_last_message_at_idx (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_members (
  id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  last_read_at DATETIME(6) NULL,
  muted TINYINT(1) NOT NULL DEFAULT 0,
  pinned_at DATETIME(6) NULL,
  nickname VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY conversation_members_unique (conversation_id, user_id),
  KEY conversation_members_user_id_idx (user_id),
  CONSTRAINT conversation_members_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT conversation_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  sender_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  reply_to_id CHAR(36) NULL,
  expires_at DATETIME(6) NULL,
  story_id CHAR(36) NULL,
  deleted_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY messages_conversation_id_idx (conversation_id, created_at),
  KEY messages_sender_id_idx (sender_id),
  KEY messages_reply_to_id_idx (reply_to_id),
  KEY messages_expires_at_idx (expires_at),
  KEY messages_story_id_idx (story_id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES messages (id) ON DELETE SET NULL,
  CONSTRAINT messages_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_attachments (
  id CHAR(36) NOT NULL,
  message_id CHAR(36) NOT NULL,
  url TEXT NOT NULL,
  media_type VARCHAR(16) NOT NULL,
  file_name VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY message_attachments_message_id_idx (message_id),
  CONSTRAINT message_attachments_media_type_check CHECK (media_type IN ('image','video','audio','file')),
  CONSTRAINT message_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_reactions (
  id CHAR(36) NOT NULL,
  message_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  reaction VARCHAR(16) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY message_reactions_message_user_unique (message_id, user_id),
  CONSTRAINT message_reactions_reaction_check CHECK (reaction IN ('love','haha','wow','sad','angry','like')),
  CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
  CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_presence (
  user_id CHAR(36) NOT NULL,
  last_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  is_online TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  CONSTRAINT user_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Groups / events / broadcast
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `groups` (
  id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  cover_url TEXT NULL,
  owner_id CHAR(36) NOT NULL,
  is_private TINYINT(1) NOT NULL DEFAULT 0,
  visibility VARCHAR(16) NOT NULL DEFAULT 'public',
  requires_post_approval TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY groups_owner_id_idx (owner_id),
  KEY groups_is_private_idx (is_private),
  KEY groups_visibility_idx (visibility),
  CONSTRAINT groups_name_not_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT groups_visibility_check CHECK (visibility IN ('public','private','hidden')),
  CONSTRAINT groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_members (
  id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'member',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY group_members_group_user_unique (group_id, user_id),
  KEY group_members_user_id_idx (user_id),
  KEY group_members_group_id_idx (group_id),
  KEY group_members_group_status_idx (group_id, status),
  CONSTRAINT group_members_role_check CHECK (role IN ('owner','admin','member')),
  CONSTRAINT group_members_status_check CHECK (status IN ('active','pending','banned')),
  CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES `groups` (id) ON DELETE CASCADE,
  CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_posts (
  id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  approval_status VARCHAR(16) NOT NULL DEFAULT 'approved',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY group_posts_post_id_unique (post_id),
  KEY group_posts_group_id_idx (group_id),
  CONSTRAINT group_posts_approval_status_check CHECK (approval_status IN ('approved','pending','rejected')),
  CONSTRAINT group_posts_group_id_fkey FOREIGN KEY (group_id) REFERENCES `groups` (id) ON DELETE CASCADE,
  CONSTRAINT group_posts_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_join_questions (
  id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  prompt TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  required TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY group_join_questions_group_id_idx (group_id),
  CONSTRAINT group_join_questions_prompt_not_empty CHECK (CHAR_LENGTH(TRIM(prompt)) > 0),
  CONSTRAINT group_join_questions_group_id_fkey FOREIGN KEY (group_id) REFERENCES `groups` (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_join_answers (
  id CHAR(36) NOT NULL,
  question_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  answer TEXT NOT NULL DEFAULT (''),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY group_join_answers_question_user_unique (question_id, user_id),
  CONSTRAINT group_join_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES group_join_questions (id) ON DELETE CASCADE,
  CONSTRAINT group_join_answers_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS broadcast_channels (
  id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY broadcast_channels_group_id_idx (group_id),
  CONSTRAINT broadcast_channels_name_not_empty CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT broadcast_channels_group_id_fkey FOREIGN KEY (group_id) REFERENCES `groups` (id) ON DELETE CASCADE,
  CONSTRAINT broadcast_channels_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS broadcast_messages (
  id CHAR(36) NOT NULL,
  channel_id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY broadcast_messages_channel_id_idx (channel_id, created_at),
  CONSTRAINT broadcast_messages_body_not_empty CHECK (CHAR_LENGTH(TRIM(body)) > 0),
  CONSTRAINT broadcast_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES broadcast_channels (id) ON DELETE CASCADE,
  CONSTRAINT broadcast_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events (
  id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  cover_url TEXT NULL,
  location VARCHAR(255) NULL,
  starts_at DATETIME(6) NOT NULL,
  ends_at DATETIME(6) NULL,
  host_id CHAR(36) NOT NULL,
  group_id CHAR(36) NULL,
  is_online TINYINT(1) NOT NULL DEFAULT 0,
  meeting_url TEXT NULL,
  recurrence_rule TEXT NULL,
  discussion_post_id CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY events_host_id_idx (host_id),
  KEY events_starts_at_idx (starts_at),
  KEY events_group_id_idx (group_id),
  CONSTRAINT events_title_not_empty CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT events_ends_after_starts CHECK (ends_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT events_host_id_fkey FOREIGN KEY (host_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT events_group_id_fkey FOREIGN KEY (group_id) REFERENCES `groups` (id) ON DELETE SET NULL,
  CONSTRAINT events_discussion_post_id_fkey FOREIGN KEY (discussion_post_id) REFERENCES posts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_members (
  id CHAR(36) NOT NULL,
  event_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'interested',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY event_members_event_user_unique (event_id, user_id),
  KEY event_members_user_id_idx (user_id),
  CONSTRAINT event_members_status_check CHECK (status IN ('going','interested','declined')),
  CONSTRAINT event_members_event_id_fkey FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
  CONSTRAINT event_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_invites (
  id CHAR(36) NOT NULL,
  event_id CHAR(36) NOT NULL,
  invitee_id CHAR(36) NOT NULL,
  invited_by CHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY event_invites_event_invitee_unique (event_id, invitee_id),
  CONSTRAINT event_invites_status_check CHECK (status IN ('pending','accepted','declined')),
  CONSTRAINT event_invites_event_id_fkey FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
  CONSTRAINT event_invites_invitee_id_fkey FOREIGN KEY (invitee_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT event_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Notifications / discovery / reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NULL,
  type VARCHAR(32) NOT NULL,
  post_id CHAR(36) NULL,
  comment_id CHAR(36) NULL,
  conversation_id CHAR(36) NULL,
  body TEXT NULL,
  group_key VARCHAR(128) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY notifications_user_created_idx (user_id, created_at),
  KEY notifications_user_unread_idx (user_id, is_read),
  KEY notifications_user_group_key_idx (user_id, group_key, created_at),
  CONSTRAINT notifications_type_check CHECK (type IN (
    'like','comment','reply','follow','mention','share','message','system','birthday','memory'
  )),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles (id) ON DELETE SET NULL,
  CONSTRAINT notifications_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT notifications_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES comments (id) ON DELETE CASCADE,
  CONSTRAINT notifications_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id CHAR(36) NOT NULL,
  likes TINYINT(1) NOT NULL DEFAULT 1,
  comments TINYINT(1) NOT NULL DEFAULT 1,
  follows TINYINT(1) NOT NULL DEFAULT 1,
  messages TINYINT(1) NOT NULL DEFAULT 1,
  mentions TINYINT(1) NOT NULL DEFAULT 1,
  shares TINYINT(1) NOT NULL DEFAULT 1,
  birthdays TINYINT(1) NOT NULL DEFAULT 1,
  memories TINYINT(1) NOT NULL DEFAULT 1,
  push_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  CONSTRAINT notification_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_tokens (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  token VARCHAR(512) NOT NULL,
  platform VARCHAR(16) NOT NULL DEFAULT 'expo',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY push_tokens_user_token_unique (user_id, token),
  CONSTRAINT push_tokens_platform_check CHECK (platform IN ('expo','web','android','ios')),
  CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reports (
  id CHAR(36) NOT NULL,
  reporter_id CHAR(36) NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_id CHAR(36) NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY reports_reporter_id_idx (reporter_id),
  KEY reports_target_idx (target_type, target_id),
  CONSTRAINT reports_target_type_check CHECK (target_type IN ('user','post','comment','message')),
  CONSTRAINT reports_status_check CHECK (status IN ('open','reviewed','dismissed')),
  CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Media registry (Phase 5 prep — replaces Supabase Storage metadata)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_objects (
  id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  bucket VARCHAR(64) NOT NULL,
  object_key VARCHAR(512) NOT NULL,
  mime_type VARCHAR(128) NULL,
  byte_size BIGINT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY media_objects_bucket_key_unique (bucket, object_key),
  KEY media_objects_owner_id_idx (owner_id),
  CONSTRAINT media_objects_bucket_check CHECK (bucket IN (
    'avatars','covers','post-media','stories','reels','messages','account-exports'
  )),
  CONSTRAINT media_objects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- Verified on Laragon MySQL 8.0.30: 70 tables after import.
-- UUID generation: application layer (or MySQL UUID()) — PHP will set ids.
-- =============================================================================
