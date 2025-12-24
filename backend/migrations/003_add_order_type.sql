ALTER TABLE orders ADD COLUMN IF NOT EXISTS type text DEFAULT 'inquiry';
COMMENT ON COLUMN orders.type IS 'Type of the order: "exchange" (full order) or "inquiry" (message-only)';

-- Optional: Attempt to backfill existing orders based on heuristics
-- If amount is greater than 0, it's likely an exchange
UPDATE orders SET type = 'exchange' WHERE amount > 0 OR (amount_give IS NOT NULL AND amount_give > 0);
