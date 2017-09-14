# Discord quiz chatbot

2017 年 CCNS QA 活動用的，
於 discord 平台上的聊天機器人，
用 discord.js 寫成。

> 不要問我為什麼沒有按鈕，discord 還沒有按鈕 ui。
> 聽說有人用 emoji 模擬按鈕，
> 就像按讚是 A，按大心是 B 之類，
> 不過我覺得體驗沒有很好就是，
> 而且手機版的 emoji 很難按，所以就用鍵盤了。
>
> * <https://feedback.discordapp.com/forums/326712-discord-dream-land/suggestions/13815273-in-chat-buttons-for-bots>
> * <https://www.reddit.com/r/discordapp/comments/5cfas9/discordjs_bot_button/>

## 執行

```javascript
var qalib = require('./qa-client')
var fs = require('fs')
var token = 'your chat bot token'
var responseDatabase = JSON.parse(fs.readFileSync('./response-database.json'))

var host = 'quiz backend server url'
// same interface as </ccns/quiz-chatbot-server>

var myClient = qalib.run(host, token, responseDatabase)
```

## chatbot 管理
由於 discord 的限制，不能直接將 bot 加為好友。（應該吧）
需先與該 bot 在同一伺服器，就能與之對話。

管理員可以透過 [管理介面](https://discordapp.com/oauth2/authorize?client_id=353136048282271744&scope=bot)
將 bot 加入伺服器，
或直接進入 bot 所在 [測試伺服器](https://discord.gg/AdUbG5B)
與 bot 對話。

與 chatbot 在同一伺服器後，
用 `@escho#1145 /start` 對 bot 下指令即可開始答題。

與 bot 的答題在私人聊天中進行，
在私人聊天中下指令不需再加 `@escho#1145` 。


## chatbot 指令

在與 bot 一對一私人訊息中可以直接用 `/somecommand` 的格式下指令；
在公頻中需要在指令前標注 `@escho#1145 /somecommand` bot 才會回應。

  - 直接回覆以 0-3 a-d A-D 開頭的訊息回答
  - `/start` 開始答題
  - `/status` 看自己的答題狀況
  - `/help` 指令說明
  - `/statistic` 排行榜

答對會對你的訊息按讚（大拇指），答錯則是向下的大拇指；
然後回覆事先錄製的對白，延時一秒後送出下一題。
