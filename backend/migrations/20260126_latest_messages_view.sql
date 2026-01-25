-- View to get the latest client message for each main_id
create or replace view latest_client_messages as
select distinct on (main_id)
    id,
    main_id,
    content,
    "Created Date",
    author_type,
    status,
    is_read
from messages
where author_type in ('user', 'bubbleUser', 'Клиент', 'Client', 'customer')
order by main_id, "Created Date" desc;

-- View to get unread counts
create or replace view unread_counts as
select 
    main_id,
    count(*) as unread_count
from messages
where 
    author_type in ('user', 'bubbleUser', 'Клиент', 'Client', 'customer') 
    and (status is null or (status != 'read' and status != 'blocked' and status != 'deleted_chat'))
group by main_id;
