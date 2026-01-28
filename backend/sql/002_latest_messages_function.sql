CREATE OR REPLACE FUNCTION get_latest_messages(target_main_ids text[], only_client boolean DEFAULT false)
RETURNS TABLE (
    main_id text,
    content text,
    "Created Date" timestamptz,
    author_type text,
    is_read boolean
)
LANGUAGE sql
AS $$
    SELECT DISTINCT ON (main_id)
        main_id::text,
        content,
        "Created Date",
        author_type,
        is_read
    FROM messages
    WHERE main_id = ANY(target_main_ids::numeric[])
    AND (
        NOT only_client 
        OR author_type IN ('user', 'bubbleUser', 'Клиент', 'Client', 'customer')
    )
    ORDER BY main_id, "Created Date" DESC;
$$;
