-- Update function to use is_read field
CREATE OR REPLACE FUNCTION get_unread_client_counts(target_main_ids text[])
RETURNS TABLE (main_id text, unread_count bigint)
LANGUAGE sql
AS $$
    WITH last_manager_timestamp AS (
        SELECT main_id, MAX("Created Date") as last_msg_date
        FROM messages
        WHERE main_id = ANY(target_main_ids::numeric[])
        AND author_type NOT IN ('user', 'bubbleUser', 'Клиент', 'Client', 'customer')
        GROUP BY main_id
    )
    SELECT
        m.main_id::text,
        COUNT(*) as unread_count
    FROM messages m
    LEFT JOIN last_manager_timestamp lmt ON m.main_id = lmt.main_id
    WHERE
        m.main_id = ANY(target_main_ids::numeric[])
        AND m.author_type IN ('user', 'bubbleUser', 'Клиент', 'Client', 'customer')
        AND (lmt.last_msg_date IS NULL OR m."Created Date" > lmt.last_msg_date)
        AND (m.is_read IS NOT TRUE)
    GROUP BY m.main_id;
$$;
