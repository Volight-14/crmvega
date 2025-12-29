-- Rename existing columns to match Bubble
ALTER TABLE orders RENAME COLUMN currency_give TO "CurrPair1";
ALTER TABLE orders RENAME COLUMN currency_get TO "CurrPair2";
ALTER TABLE orders RENAME COLUMN amount_give TO "SumInput";
ALTER TABLE orders RENAME COLUMN amount_get TO "SumOutput";
ALTER TABLE orders RENAME COLUMN bank_1 TO "BankRus01";
ALTER TABLE orders RENAME COLUMN bank_2 TO "BankRus02";
ALTER TABLE orders RENAME COLUMN city_1 TO "CityRus01";
ALTER TABLE orders RENAME COLUMN city_2 TO "CityEsp02";
ALTER TABLE orders RENAME COLUMN delivery_time TO "DeliveryTime";
ALTER TABLE orders RENAME COLUMN is_paid TO "OrderPaid";
ALTER TABLE orders RENAME COLUMN payment_timing TO "PayNow";
ALTER TABLE orders RENAME COLUMN is_remote TO "Remote";
ALTER TABLE orders RENAME COLUMN delivery_day_type TO "NextDay";
ALTER TABLE orders RENAME COLUMN title TO "OrderName";
ALTER TABLE orders RENAME COLUMN description TO "Comment";
ALTER TABLE orders RENAME COLUMN order_date TO "OrderDate";

-- Add new columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "ATM_Esp" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "BankEsp" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "Card_NumberOrSBP" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "CityEsp01" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "CityRus02" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "ClientCryptoWallet" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "ClientIBAN" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "End_address" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "Location2" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "MessageIBAN" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "NetworkUSDT01" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "NetworkUSDT02" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "New_address" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "OrderStatus" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "Ordertime" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "PayeeName" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "tg_amo" text;

-- Numeric fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "CashbackEUR" numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "CashbackUSDT" numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "LoyPoints" numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "SumEquivalentEUR" numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "SumPartly" numeric DEFAULT 0;

-- Date fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "WhenDone" timestamp with time zone;

-- Boolean fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "first_order" boolean DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "Is_application_accepted" boolean DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "On_site" boolean DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "Request_address" boolean DEFAULT false;

-- User fields (Bubble IDs)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "Manager_Bubble" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "Operators_Bubble" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "BubbleUser" text;

-- File fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "AttachedCheck" text;

-- Other requested fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "plused_temp" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "plused_temp2" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "ATM" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "Location1" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "UndoStep" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "OnlineExchInfo" text;
