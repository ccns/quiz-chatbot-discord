# Discord quiz chatbot

2017 年 CCNS QA 活動用的，
於 discord 平台上的聊天機器人，
用 discord.js 寫成。

## 執行

```javascript
var qalib = require('./qa-client)
var token = 'your chat bot token'

var host = 'quiz backend server url' // same interface as 
                                     // </ccns/quiz-chatbot-server>

var myClient = qalib.run(host, token)
```

## chatbot 操作
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

在與 bot 一對一私人訊息中可以直接用 `/somecommand` 的格式下指令；
在公頻中需要在指令前標注 `@escho#1145 /somecommand` bot才會回應。
