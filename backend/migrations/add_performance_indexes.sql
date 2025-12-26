-- Performance Optimization Indexes Migration
-- Created: 2025-12-26
-- Purpose: Add indexes to improve orders and messages loading performance

-- ============================================
-- ORDERS TABLE INDEXES
-- ============================================

-- Index for filtering by status and sorting by creation date
-- Used in: GET /api/orders with status filter
CREATE INDEX IF NOT EXISTS idx_orders_status_created 
ON orders(status, created_at DESC);

-- Index for filtering by contact
-- Used in: GET /api/orders?contact_id=X
CREATE INDEX IF NOT EXISTS idx_orders_contact_id 
ON orders(contact_id);

-- Composite index for common queries (status + contact + date)
-- Used in: Kanban board with filters
CREATE INDEX IF NOT EXISTS idx_orders_status_contact_created 
ON orders(status, contact_id, created_at DESC);

-- Index for main_id (used for linking with messages)
-- Used in: Message queries that join with orders
CREATE INDEX IF NOT EXISTS idx_orders_main_id 
ON orders(main_id) 
WHERE main_id IS NOT NULL;

-- ============================================
-- MESSAGES TABLE INDEXES
-- ============================================

-- CRITICAL: Index for main_id (most important for performance)
-- Used in: GET /api/messages/contact/:contactId, GET /api/order-messages/:orderId/client
CREATE INDEX IF NOT EXISTS idx_messages_main_id 
ON messages(main_id);

-- Index for sorting by creation date
-- Used in: All message queries with ORDER BY
CREATE INDEX IF NOT EXISTS idx_messages_created_date 
ON messages("Created Date");

-- Composite index for optimal message queries
-- Used in: Fetching messages for specific main_id sorted by date
CREATE INDEX IF NOT EXISTS idx_messages_main_id_created 
ON messages(main_id, "Created Date");

-- Index for lead_id (legacy support)
-- Used in: Backward compatibility queries
CREATE INDEX IF NOT EXISTS idx_messages_lead_id 
ON messages(lead_id);

-- ============================================
-- ORDER_MESSAGES TABLE INDEXES
-- ============================================

-- Index for order_id lookups
-- Used in: Finding messages for a specific order
CREATE INDEX IF NOT EXISTS idx_order_messages_order_id 
ON order_messages(order_id);

-- Index for message_id lookups
-- Used in: Reverse lookups from messages to orders
CREATE INDEX IF NOT EXISTS idx_order_messages_message_id 
ON order_messages(message_id);

-- Composite unique index (prevents duplicates and speeds up upserts)
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_messages_unique 
ON order_messages(order_id, message_id);

-- ============================================
-- CONTACTS TABLE INDEXES
-- ============================================

-- Index for telegram_user_id lookups
-- Used in: Finding contacts by Telegram ID
CREATE INDEX IF NOT EXISTS idx_contacts_telegram_user_id 
ON contacts(telegram_user_id) 
WHERE telegram_user_id IS NOT NULL;

-- Index for last_message_at (for inbox sorting)
-- Used in: GET /api/contacts/summary
CREATE INDEX IF NOT EXISTS idx_contacts_last_message 
ON contacts(last_message_at DESC NULLS LAST);

-- ============================================
-- ORDER_TAGS TABLE INDEXES
-- ============================================

-- Index for finding tags by order
-- Used in: Loading tags for multiple orders
CREATE INDEX IF NOT EXISTS idx_order_tags_order_id 
ON order_tags(order_id);

-- ============================================
-- INTERNAL_MESSAGES TABLE INDEXES
-- ============================================

-- Index for order_id and created_at
-- Used in: GET /api/order-messages/:orderId/internal
CREATE INDEX IF NOT EXISTS idx_internal_messages_order_created 
ON internal_messages(order_id, created_at);

-- Index for unread messages
-- Used in: GET /api/order-messages/:orderId/internal/unread
CREATE INDEX IF NOT EXISTS idx_internal_messages_unread 
ON internal_messages(order_id, is_read) 
WHERE is_read = false;

-- ============================================
-- ANALYZE TABLES
-- ============================================

-- Update statistics for query planner
ANALYZE orders;
ANALYZE messages;
ANALYZE order_messages;
ANALYZE contacts;
ANALYZE order_tags;
ANALYZE internal_messages;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Run these queries to verify indexes are being used:

-- EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'new' ORDER BY created_at DESC LIMIT 50;
-- EXPLAIN ANALYZE SELECT * FROM messages WHERE main_id = '123456' ORDER BY "Created Date";
-- EXPLAIN ANALYZE SELECT * FROM order_messages WHERE order_id = 1;
