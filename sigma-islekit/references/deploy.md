# 部署說明

> 只有在使用者明確同意後才部署。使用者在造島工坊選的偏好：**GitHub Pages**。
> 部署前先問：「要放到哪裡？Netlify／GitHub Pages／Cloudflare Pages／Vercel／先不要」，並說明各自需要的帳號。
> 需要登入時，請使用者自己在終端機執行登入指令，不要索取或保存密碼、token。

網站根目錄是 `site/`（裡面直接有 index.html），沒有建置步驟。專案名稱建議用 `sigma`。

## Netlify
- 最簡單：打開 https://app.netlify.com/drop ，把 `site` 資料夾拖進去。
- 指令：`npx netlify-cli login`（使用者自己登入）→ `npx netlify-cli deploy --dir site --prod`，第一次會詢問建立新網站。
- 免費方案的新網站右下角預設會出現「Powered by Netlify」徽章，可能蓋到網站按鈕。先問使用者要不要關；要關就到 Netlify 後台 Project configuration → General → Powered by Netlify badge 關閉（不需重新部署）。

## GitHub Pages
1. 使用者先登入：`gh auth login`。
2. 在 site 資料夾建立 repo 並推上去：
   ```
   cd site
   git init && git add . && git commit -m "first island"
   gh repo create sigma --public --source . --push
   ```
3. 開啟 Pages：`gh api -X POST repos/{owner}/sigma/pages -f "source[branch]=main" -f "source[path]=/"`（或到 repo 的 Settings → Pages 選 main）。
4. 網址：`https://<帳號>.github.io/sigma/`，第一次約需 1～2 分鐘。注意網站在子路徑下，所有資源要用相對路徑。

## Cloudflare Pages
- `npx wrangler login`（使用者自己登入）→ `npx wrangler pages deploy site --project-name sigma --branch main`。
- 新版 wrangler 第一次建立專案若失敗，依錯誤訊息先建立 Pages 專案再部署。

## Vercel
- `npx vercel login` → `npx vercel deploy site --prod`。

## 部署後必做驗證
1. 用瀏覽器或 `curl -I` 確認正式網址首頁回應 200。
2. 確認 index.html 引用的 CSS、JS 與 `data/content.json` 都回應 200（逐一檢查實際引用的檔名）。
3. 實際打開網址，點一座島，內容面板要出現；console 沒有錯誤。
4. 把正式網址、驗證結果交給使用者。
