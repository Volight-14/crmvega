# Jira Task: VEG-35

**Summary**: CRM Алерты
**Status**: Володя | **Priority**: Medium | **Reporter**: Евгений

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
          "text": "В веб и моб версии Нужны алерты визуальные как ниже"
        }
      ]
    },
    {
      "type": "mediaSingle",
      "attrs": {
        "width": 133,
        "widthType": "pixel",
        "layout": "align-start"
      },
      "content": [
        {
          "type": "media",
          "attrs": {
            "type": "file",
            "id": "483fce9e-34dc-4221-b041-f7839bbeefc3",
            "alt": "image-20260117-094455.png",
            "collection": "",
            "height": 65,
            "width": 133
          }
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "и звуковые когда приходит новое сообщение, чтоб можно было включить и выключить"
        },
        {
          "type": "hardBreak"
        }
      ]
    },
    {
      "type": "mediaSingle",
      "attrs": {
        "width": 419,
        "widthType": "pixel",
        "layout": "align-start"
      },
      "content": [
        {
          "type": "media",
          "attrs": {
            "type": "file",
            "id": "feae05c4-abad-4cb7-90bd-b156e0a430de",
            "alt": "image-20260117-094643.png",
            "collection": "",
            "height": 252,
            "width": 419
          }
        }
      ]
    }
  ]
}

## Attachments
No image attachments found.

## Comments History

### Евгений (1/17/2026, 3:55:40 PM)
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Меняем “Настройки - Уведомления”: "
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "- Email уведомления - удаляем"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "- ”Обновления сделок” назови “Все уведомления“ и тогда сотруднику будут приходить алерты звуковые и отображение на вкладке красные цифры (как на скрине выше) на все сообщения входящие от клиентов"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "- “Новые сообщения” назови “Только мои уведомления“ будут приходить алерты на сообщения клиентов только на выбранные этапы (то есть сообщения клиентов на ордера которые в этих этапах)"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "Как это работает? ",
          "marks": [
            {
              "type": "strong"
            }
          ]
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "По умолчанию у сотрудника будут включены все алерты (Настройки - Уведомления)- ему будет приходить звук и отображаться красный кружочек на вкладке с цифрой новых сообщений по ВСЕМ входящим сообщениям. "
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "В настройках сотрудник может выбрать алерты на определенные этапы (мультидропдаун), и тогда все алерты будут отключены и ему будут приходить только те которые он отметил в мультидропдауне. "
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "Например, оператор Анна выбирает этапы “Неразобранное“ и “Принято Анна”, менеджер Никита выбирает только этап “Передано Никите” - им приходят алерты только по тем входящим сообщением от клиентов ордера по которым находятся в этих этапах"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "- Обновления контактов и Ежедневный отчет пусть остаются так - настроим позже"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Колокольчик - пока давай сюда дублировать счётчик сообщений (цифра) который отображается на вкладке url в красном кружочке "
        }
      ]
    }
  ]
}

---
### Евгений (1/23/2026, 9:42:11 PM)
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Ха! Смотри как интересно – если я выставляю в настройках уведомления на какие-то свои этапы и потом отключаю её и включаю все уведомления как на скрине ниже (статус Неразобранное), то у меня никакие алерты не приходят не звуковые ни цифра на вкладке"
        },
        {
          "type": "hardBreak"
        }
      ]
    },
    {
      "type": "mediaSingle",
      "attrs": {
        "width": 665,
        "widthType": "pixel",
        "layout": "align-start"
      },
      "content": [
        {
          "type": "media",
          "attrs": {
            "type": "file",
            "id": "f5d01560-43e7-4904-a7e8-6ae26d78346c",
            "alt": "image-20260123-184143.png",
            "collection": "",
            "height": 196,
            "width": 730
          }
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "А если я убираю все этапы и включаю все уведомления как на скрине ниже, то звуки и цифры приходят"
        },
        {
          "type": "hardBreak"
        }
      ]
    },
    {
      "type": "mediaSingle",
      "attrs": {
        "width": 549,
        "widthType": "pixel",
        "layout": "align-start"
      },
      "content": [
        {
          "type": "media",
          "attrs": {
            "type": "file",
            "id": "0f283ab6-5418-47da-903b-3c6f6b130659",
            "alt": "image-20260123-184048.png",
            "collection": "",
            "height": 204,
            "width": 725
          }
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "hardBreak"
        },
        {
          "type": "hardBreak"
        },
        {
          "type": "text",
          "text": "И ещё если я пишу сообщение как клиент то приходит 1 звук а если я как клиент отвечаю на сообщения оператора то приходит два звука"
        }
      ]
    }
  ]
}

---
