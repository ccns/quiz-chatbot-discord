# Discord quiz chatbot

2017 年 CCNS QA 活動用的，
於 discord 平台上的聊天機器人，
用 discord.js 寫成。

discord.js 入門可以看 <https://discordjs.guide> ，
api 文件則看 <https://discord.js.org/#/docs/main/stable/general/welcome> 。
另外 api 中有用到一個型別 collection，
不知道為什麼原本在文件裡的連結連不過去，一直找不到這個類的 api。
後來手動在左上角切成 `View docs for Collection master` 才看到
<https://discord.js.org/#/docs/collection/master/class/Collection> 。

## 執行
```sh
echo http://api.url/path > api.url
echo XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX > discord.token
node index.js api.url token response-database.json
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
  - 或按題目下的 emoji 反應 A B C D 回答
  - `/start` 開始答題
  - `/status` 看自己的答題狀況
  - `/help` 指令說明
  - `/statistic` 排行榜

答對會對你的訊息按讚（大拇指），答錯則是向下的大拇指；
然後回覆事先錄製的對白，延時一秒後送出下一題。
