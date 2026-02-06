# Jira Task: VEG-64

**Summary**: CRM. Смена этапа - служебное сообщение
**Status**: Володя | **Priority**: High | **Reporter**: Евгений

## Description

{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Нужно добавить "
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "1) Теги и другие действия сотрудника (коммент ниже)"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "2) Вов добавь плиз в эту строку "
        }
      ]
    },
    {
      "type": "mediaSingle",
      "attrs": {
        "width": 500,
        "widthType": "pixel",
        "layout": "align-start"
      },
      "content": [
        {
          "type": "media",
          "attrs": {
            "type": "file",
            "id": "1f879f4e-abc8-49cd-bb29-0cc1c627b871",
            "alt": "image-20260204-094534.png",
            "collection": "",
            "height": 54,
            "width": 500
          }
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "в конце дату с секундами 03.02.26 12:05:31"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "3) служебное сообщение должно заносится только в свой ордер, а не во все открытые на юзера. Пример "
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "https://crmvega.vercel.app/order/1769873416276",
          "marks": [
            {
              "type": "link",
              "attrs": {
                "href": "https://crmvega.vercel.app/order/1769873416276"
              }
            }
          ]
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "https://crmvega.vercel.app/order/1770110716069",
          "marks": [
            {
              "type": "link",
              "attrs": {
                "href": "https://crmvega.vercel.app/order/1770110716069"
              }
            }
          ]
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "юзер один но у него 2 ордера открыты служебное сообщение (🔄 Eugene смена этапа: Принято Анна (было: На модерации) падает в общий колодец (по типу как как сообщения клиента/опреатора), но должно падать только в свой ордер и не отображаться во втором"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "4) Вов я добавил  в бабл два POST вызова"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "➡️ note_to_user "
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "https://crmvega-g766.onrender.com/api/webhook/bubble/note_to_user",
          "marks": [
            {
              "type": "link",
              "attrs": {
                "href": "https://crmvega-g766.onrender.com/api/webhook/bubble/note_to_user"
              }
            }
          ]
        },
        {
          "type": "text",
          "text": " "
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "передаю"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "{"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "  \"user\": <user_id>, "
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "  \"note\": \"<note>\""
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "}"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "и"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "➡️ note_to_order"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "https://crmvega-g766.onrender.com/api/webhook/bubble/note_to_order",
          "marks": [
            {
              "type": "link",
              "attrs": {
                "href": "https://crmvega-g766.onrender.com/api/webhook/bubble/note_to_order"
              }
            }
          ]
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "передаю"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "{"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "  \"main_id\": <main_id>,"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "  \"note\": \"<note>\""
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "}"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "Добавь плиз обработку:"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "note_to_user",
          "marks": [
            {
              "type": "strong"
            }
          ]
        },
        {
          "type": "text",
          "text": " добавляет note - служебное сообщение (как смена этапа) в колодец как в Диалогах -сквозная переписка по всем ордерам ПЛЮС в меню Контакт, в Заметки (создается новая заметка)"
        }
      ]
    },
    {
      "type": "mediaSingle",
      "attrs": {
        "width": 217,
        "widthType": "pixel",
        "layout": "align-start"
      },
      "content": [
        {
          "type": "media",
          "attrs": {
            "type": "file",
            "id": "1ae96cbe-cd4c-402c-b107-2af1800bce74",
            "alt": "image-20260204-101833.png",
            "collection": "",
            "height": 485,
            "width": 453
          }
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "в поле “Заметки“ записывает note"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "note_to_order",
          "marks": [
            {
              "type": "strong"
            }
          ]
        },
        {
          "type": "text",
          "text": " просто в ордер добавляет note (по типу как выше описывал смену этапа), не в сквозной колодец - только в одby ордер"
        }
      ]
    }
  ]
}

## Attachments
No image attachments found.

## Comments History

### Евгений (1/27/2026, 1:26:05 PM)
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "И давай вообще все действия сотрудников выносить, чтоб контролировать кто что сделал, типа добавил тег - вот как в амо это реализовано"
        }
      ]
    },
    {
      "type": "mediaSingle",
      "attrs": {
        "width": 356,
        "widthType": "pixel",
        "layout": "align-start"
      },
      "content": [
        {
          "type": "media",
          "attrs": {
            "type": "file",
            "id": "f7f4b95b-196f-48fd-8602-8fb012e5f041",
            "alt": "image-20260127-102548.png",
            "collection": "",
            "height": 57,
            "width": 356
          }
        }
      ]
    }
  ]
}

---
