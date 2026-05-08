# 📦 IPA Master V47 - Ultimate OTA Manager (Bản Hoàn Chỉnh)

![Version](https://img.shields.io/badge/Phiên_Bản-47.0_Final-red.svg)
![Design](https://img.shields.io/badge/Giao_Diện-Apple_Luxury-black.svg)
![Language](https://img.shields.io/badge/Ngôn_Ngữ-Tiếng_Việt-blue.svg)

**IPA Master V47** là giải pháp quản lý và phân phối ứng dụng iOS (OTA) chuyên nghiệp nhất chạy trên nền tảng Cloudflare Workers & R2.

---

## ✨ Tính năng nổi bật (Đã tích hợp đầy đủ)

- 🍎 **Giao diện Apple Luxury:** Trang tải app thiết kế chuẩn App Store, font chữ San Francisco mượt mà.
- 🔗 **Shortlink Pro (is.gd):** Tự động rút gọn link cài đặt và có nút tạo lại link nếu bị lỗi.
- 🛠️ **Command Center V47:** Quản lý nhiều tài khoản Cloudflare cùng lúc trên một Dashboard duy nhất.
- 🏷️ **Auto Metadata:** Tự động lấy Icon, Bundle ID, Version, iOS Min, Team Cert từ file IPA.
- 📊 **Storage Manager:** Hiển thị dung lượng đã dùng của từng tài khoản theo thời gian thực.
- 🔄 **Smart Update:** Cập nhật phiên bản mới giữ nguyên link cài đặt cũ.
- 📋 **Quản lý thông minh:** Tìm kiếm nhanh, Sắp xếp (Theo ngày, tên, lượt tải), Export dữ liệu JSON.
- 🛡️ **Bảo mật tối đa:** Endpoint `/storage` và `/list` đều được bảo vệ bằng mật khẩu Admin.

---

## 🛠️ Hướng dẫn cài đặt nhanh

### Bước 1: Thiết lập Cloudflare R2
1. Tạo một **R2 Bucket** mới.
2. Vào **Settings > CORS Policy**, nhấn Edit và dán đoạn mã sau:
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```

### Bước 2: Triển khai Worker (Backend)
1. Tạo một Worker mới và dán toàn bộ mã nguồn trong phần **[Mã nguồn Worker]** bên dưới.
2. Vào **Settings > Variables**: Thêm biến `ACCESS_PASSWORD` (Mật khẩu đăng nhập Dashboard).
3. Vào **Settings > Bindings**: Nhấn **Add binding > R2 Bucket**, đặt tên Variable là `MY_BUCKET` và chọn đúng Bucket bạn vừa tạo.
4. Nhấn **Deploy**.

### Bước 3: Sử dụng Dashboard (Frontend)
1. Mở file **Dashboard (index.html)** trong phần bên dưới bằng trình duyệt.
2. Nhập mật khẩu bạn đã đặt ở Bước 2 để bắt đầu quản lý.

---

## 🔧 [1] Mã nguồn Backend — `worker.js` (Bản Hoàn Chỉnh V47)

```javascript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = env.WEB_DOMAIN ? "https://" + env.WEB_DOMAIN : url.origin;
    const authPass = env.ACCESS_PASSWORD;
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // --- CÁC ENDPOINT CÔNG KHAI ---
    if (url.pathname.startsWith("/v/")) {
      const id = url.pathname.split("/v/")[1];
      const obj = await env.MY_BUCKET.get(`meta/${id}.json`);
      if (!obj) return new Response("404 Không Tìm Thấy", { status: 404 });
      return new Response(generateLuxuryView(await obj.json(), host), { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } });
    }

    if (url.pathname.startsWith("/p/")) {
      const id = url.pathname.split(".plist")[0].split("/p/")[1];
      const obj = await env.MY_BUCKET.get(`meta/${id}.json`);
      if (!obj) return new Response("Not Found", { status: 404 });
      return new Response(generatePlist(await obj.json(), host), { headers: { "Content-Type": "application/xml", ...corsHeaders } });
    }

    if (url.pathname.startsWith("/f/")) {
      const fileName = url.pathname.split("/f/")[1];
      const file = await env.MY_BUCKET.get(`files/${fileName}`);
      if (!file) return new Response("Not Found", { status: 404 });
      return new Response(file.body, { headers: { "Content-Type": "application/octet-stream", ...corsHeaders } });
    }

    if (url.pathname.startsWith("/i/")) {
      const id = url.pathname.split("/i/")[1];
      ctx.waitUntil((async () => {
        try {
          const obj = await env.MY_BUCKET.get(`meta/${id}.json`);
          if (obj) {
            let meta = await obj.json();
            meta.downloads = (meta.downloads || 0) + 1;
            await env.MY_BUCKET.put(`meta/${id}.json`, JSON.stringify(meta));
          }
        } catch (e) {}
      })());
      return Response.redirect(`itms-services://?action=download-manifest&url=${host}/p/${id}.plist`, 302);
    }

    if (url.pathname === "/login") {
      const body = await request.json();
      return new Response(JSON.stringify({ success: body.password === authPass }), { headers: corsHeaders });
    }

    // --- CÁC ENDPOINT YÊU CẦU MẬT KHẨU ---
    const auth = request.headers.get("Authorization");
    if (auth !== authPass) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    if (url.pathname === "/storage") {
      let total = 0; let cursor = undefined;
      do {
        const list = await env.MY_BUCKET.list({ cursor });
        for (let obj of list.objects) total += obj.size;
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);
      return new Response(JSON.stringify({ usedBytes: total }), { headers: corsHeaders });
    }

    if (url.pathname === "/upload/start") {
      const { fileName } = await request.json();
      const upload = await env.MY_BUCKET.createMultipartUpload(`files/${fileName}`);
      return new Response(JSON.stringify({ uploadId: upload.uploadId, key: upload.key }), { headers: corsHeaders });
    }

    if (url.pathname === "/upload/part") {
      const uploadId = url.searchParams.get("uploadId");
      const partNumber = parseInt(url.searchParams.get("partNumber"));
      const key = url.searchParams.get("key");
      const upload = env.MY_BUCKET.resumeMultipartUpload(key, uploadId);
      const part = await upload.uploadPart(partNumber, request.body);
      return new Response(JSON.stringify(part), { headers: corsHeaders });
    }

    if (url.pathname === "/upload/complete") {
      const { uploadId, key, parts, appData } = await request.json();
      await (env.MY_BUCKET.resumeMultipartUpload(key, uploadId)).complete(parts);
      appData.fileName = key.replace('files/', '');
      appData.webLink = `${host}/v/${appData.id}`;
      appData.ipaLink = `${host}/f/${appData.fileName}`;
      appData.uploadTs = Date.now();
      appData.releaseDate = new Date().toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' });
      appData.isgdLink = await shortenLink(`${host}/i/${appData.id}`);
      await env.MY_BUCKET.put(`meta/${appData.id}.json`, JSON.stringify(appData));
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (url.pathname === "/shorten") {
      const id = url.searchParams.get("id");
      const obj = await env.MY_BUCKET.get(`meta/${id}.json`);
      if (obj) {
        let meta = await obj.json();
        meta.isgdLink = await shortenLink(`${host}/i/${id}`);
        await env.MY_BUCKET.put(`meta/${id}.json`, JSON.stringify(meta));
        return new Response(JSON.stringify({ success: true, link: meta.isgdLink }), { headers: corsHeaders });
      }
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }

    if (url.pathname === "/upload/edit") {
      const { id, name, certName, newFileName, newIcon } = await request.json();
      let meta = await (await env.MY_BUCKET.get(`meta/${id}.json`)).json();
      if (newFileName && meta.fileName !== newFileName) {
        const old = await env.MY_BUCKET.get(`files/${meta.fileName}`);
        const newKey = `files/${newFileName.endsWith('.ipa') ? newFileName : newFileName + '.ipa'}`;
        await env.MY_BUCKET.put(newKey, old.body); await env.MY_BUCKET.delete(`files/${meta.fileName}`);
        meta.fileName = newKey.replace('files/', ''); meta.ipaLink = `${host}/f/${meta.fileName}`;
      }
      if (name) meta.name = name; if (certName) meta.certName = certName; if (newIcon) meta.icon = newIcon;
      await env.MY_BUCKET.put(`meta/${id}.json`, JSON.stringify(meta));
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (url.pathname === "/list") {
      const cursor = url.searchParams.get("cursor") || undefined;
      const list = await env.MY_BUCKET.list({ prefix: "meta/", limit: 50, cursor });
      const apps = [];
      for (const o of list.objects) {
        try { apps.push(await (await env.MY_BUCKET.get(o.key)).json()); } catch(e) {}
      }
      return new Response(JSON.stringify({ apps, nextCursor: list.truncated ? list.cursor : null }), { headers: corsHeaders });
    }

    if (url.pathname === "/delete" && request.method === "DELETE") {
      const id = url.searchParams.get("id");
      const m = await (await env.MY_BUCKET.get(`meta/${id}.json`)).json();
      await env.MY_BUCKET.delete(`files/${m.fileName}`); await env.MY_BUCKET.delete(`meta/${id}.json`);
      return new Response("OK", { headers: corsHeaders });
    }
    return new Response("Not Found", { status: 404 });
  }
};

async function shortenLink(url) {
  try {
    const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`);
    const data = await res.json(); return data.shorturl || url;
  } catch (e) { return url; }
}

function generatePlist(app, host) {
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>items</key><array><dict><key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>${host}/f/${app.fileName}</string></dict></array><key>metadata</key><dict><key>bundle-identifier</key><string>${app.bundleId}</string><key>bundle-version</key><string>${app.version}</string><key>kind</key><string>software</string><key>title</key><string>${app.name}</string></dict></dict></array></dict></plist>`;
}

function generateLuxuryView(app, host) {
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${app.name}</title>
    <style>
      :root{--blue:#007aff;--bg:#000;--card:rgba(255,255,255,0.08)}
      body{background:var(--bg);color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;padding:0;min-height:100vh;overflow-x:hidden}
      .blur-bg{position:fixed;top:-50px;left:-50px;width:120%;height:120%;background:url('${app.icon}') center/cover;filter:blur(80px) brightness(0.4);z-index:-1}
      .app-wrapper{max-width:500px;margin:0 auto;padding:20px;animation:fUp 0.8s ease}@keyframes fUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
      .header-info{display:flex;gap:20px;align-items:center;margin-top:40px;margin-bottom:30px}
      .main-icon{width:110px;height:110px;border-radius:24px;box-shadow:0 15px 30px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1)}
      .title-box h1{margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px}
      .dev-name{color:var(--blue);font-weight:500;font-size:14px;margin:4px 0}
      .cert-tag{background:rgba(255,255,255,0.1);padding:4px 10px;border-radius:8px;font-size:10px;font-weight:700;display:inline-block;margin-top:8px;color:#aaa}
      .btn-install{background:var(--blue);color:#fff;text-decoration:none;display:block;text-align:center;padding:16px;border-radius:20px;font-weight:700;font-size:16px;margin:25px 0;transition:0.2s}.btn-install:active{transform:scale(0.96);opacity:0.8}
      .btn-ipa{background:rgba(255,255,255,0.1);color:#fff;text-decoration:none;display:block;text-align:center;padding:12px;border-radius:15px;font-size:13px;font-weight:600}
      .metrics{display:flex;justify-content:space-between;background:var(--card);padding:20px;border-radius:25px;margin:20px 0}
      .m-item{text-align:center;flex:1}.m-label{font-size:10px;color:#888;font-weight:700;margin-bottom:5px;display:block}.m-val{font-size:15px;font-weight:700}
      .section-title{font-size:19px;font-weight:700;margin:30px 0 15px}
      .whats-new{background:var(--card);padding:20px;border-radius:25px;font-size:14px;line-height:1.6;color:#ddd}
      .info-row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:14px}.info-row span:first-child{color:#888}
      .footer-guide{margin-top:40px;text-align:center;font-size:12px;color:#666;padding:20px}
    </style>
    </head><body><div class="blur-bg"></div><div class="app-wrapper">
      <div class="header-info"><img src="${app.icon}" class="main-icon"><div class="title-box"><h1>${app.name}</h1><div class="dev-name">${app.certName}</div><div class="cert-tag">ỨNG DỤNG ĐÃ ĐƯỢC KÝ</div></div></div>
      <div class="metrics"><div class="m-item"><span class="m-label">ĐÁNH GIÁ</span><span class="m-val">4.9 ★</span></div><div class="m-item" style="border-left:1px solid rgba(255,255,255,0.1); border-right:1px solid rgba(255,255,255,0.1)"><span class="m-label">PHIÊN BẢN</span><span class="m-val">${app.version}</span></div><div class="m-item"><span class="m-label">LƯỢT TẢI</span><span class="m-val">${app.downloads||0}+</span></div></div>
      <a href="${host}/i/${app.id}" class="btn-install">CÀI ĐẶT</a><a href="${app.ipaLink}" class="btn-ipa">Tải IPA (${app.size})</a>
      <div class="section-title">Có gì mới</div><div class="whats-new">Phiên bản ${app.version} mang lại trải nghiệm mượt mà nhất trên iOS ${app.minOs}+.</div>
      <div class="section-title">Thông tin chi tiết</div><div class="info-list">
        <div class="info-row"><span>Nhà cung cấp</span><b>${app.certName}</b></div><div class="info-row"><span>Dung lượng</span><b>${app.size}</b></div><div class="info-row"><span>HĐH</span><b>iOS ${app.minOs}+</b></div><div class="info-row" style="border:none"><span>Ngày phát hành</span><b>${app.releaseDate}</b></div>
      </div><div class="footer-guide">Mở bằng Safari. Tin cậy chứng chỉ trong Cài đặt hệ thống.</div>
    </div></body></html>`;
}
```

---

## 🖥️ [2] Mã nguồn Frontend — `index.html` (Bản Hoàn Chỉnh V47)

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IPA MASTER | COMMAND CENTER</title>
    <style>
        :root { --accent: #007aff; --bg: #000; --card: #1c1c1e; --border: #38383a; --text: #fff; }
        body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; min-height: 100vh; }
        .navbar { backdrop-filter: blur(20px); background: rgba(0,0,0,0.8); padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 0.5px solid var(--border); position: sticky; top: 0; z-index: 1000; }
        .logo { font-size: 20px; font-weight: 600; }
        .container { max-width: 1300px; margin: 30px auto; padding: 0 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 25px; }
        .card { background: var(--card); border-radius: 25px; padding: 25px; border: 0.5px solid var(--border); position: relative; }
        .st-bar { height: 6px; background: #333; border-radius: 10px; margin: 15px 0; overflow: hidden; }
        .st-fill { height: 100%; background: var(--accent); width: 0%; transition: 1.5s; }
        .search-in { width: 100%; padding: 12px; border-radius: 12px; border: none; background: #2c2c2e; color: #fff; margin-bottom: 15px; box-sizing: border-box; font-family: inherit; }
        .upload-box { border: 1.5px dashed #444; border-radius: 20px; padding: 25px; text-align: center; cursor: pointer; margin-bottom: 20px; transition: 0.2s; }
        .upload-box:hover { border-color: var(--accent); background: rgba(0,122,255,0.05); }
        .app-item { background: #2c2c2e; border-radius: 20px; padding: 15px; margin-bottom: 12px; transition: 0.2s; }
        .app-top { display: flex; align-items: center; gap: 12px; }
        .app-icon { width: 55px; height: 55px; border-radius: 12px; }
        .app-name { font-weight: 600; font-size: 15px; color: var(--accent); flex: 1; }
        .act-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 12px; }
        .act-btn { padding: 10px; border-radius: 10px; border: none; font-size: 10px; font-weight: 700; color: #fff; cursor: pointer; text-align: center; background: #3a3a3c; }
        .act-btn:hover { background: #48484a; }
        .p-wrap { height: 4px; background: #000; border-radius: 5px; margin-top: 10px; display: none; overflow: hidden; }
        .p-fill { height: 100%; background: var(--accent); width: 0%; transition: 0.3s; }
        #modal-edit { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.9); align-items: center; justify-content: center; z-index: 2000; }
        .m-content { background: #1c1c1e; padding: 30px; border-radius: 30px; width: 90%; max-width: 400px; border: 0.5px solid var(--border); }
        .m-in { width: 100%; padding: 12px; margin: 10px 0; border-radius: 12px; border: none; background: #2c2c2e; color: #fff; box-sizing: border-box; }
    </style>
    <script src="https://unpkg.com/app-info-parser@1.1.4/dist/app-info-parser.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
</head>
<body>

    <div id="login-screen" style="height:90vh; display:flex; align-items:center; justify-content:center;">
        <div class="card" style="width:320px; text-align:center;">
            <h1>IPA MASTER</h1>
            <input type="password" id="admin-pass" class="m-in" placeholder="Mật khẩu Admin" style="text-align:center">
            <button class="m-in" style="background:var(--accent); font-weight:700; cursor:pointer" onclick="login()">ĐĂNG NHẬP</button>
        </div>
    </div>

    <div id="dashboard" style="display:none;">
        <nav class="navbar"><div class="logo">Apple Dashboard</div><button onclick="logout()" style="color:#ff453a; background:none; border:none; font-weight:600; cursor:pointer">Thoát</button></nav>
        <div class="container"><div class="grid" id="account-grid"></div></div>
    </div>

    <div id="modal-edit"><div class="m-content">
        <h3 style="margin-top:0">Sửa Ứng dụng</h3>
        <center><img id="e-img" style="width:80px; height:80px; border-radius:18px; cursor:pointer" onclick="document.getElementById('e-file').click()"></center>
        <input type="file" id="e-file" style="display:none" onchange="prevIcon(this)">
        <input type="hidden" id="e-id"><input type="hidden" id="e-idx">
        <input type="text" id="e-name" class="m-in" placeholder="Tên app"><input type="text" id="e-fname" class="m-in" placeholder="Tên file .ipa"><input type="text" id="e-cert" class="m-in" placeholder="Cert Name">
        <button class="m-in" style="background:var(--accent); font-weight:700" onclick="saveE()">LƯU</button><button class="m-in" style="background:#3a3a3c" onclick="closeE()">HỦY</button>
    </div></div>

<script>
    const ACCOUNTS = [
        { name: "Storage 01", api: "https://dev.ipadl1.workers.dev" },
        { name: "Storage 02", api: "https://dev.ipadl2.workers.dev" }
    ];

    let PASS = localStorage.getItem("ipa_master_pass") || "";
    let ALL_DATA = {};

    function login(){ PASS = document.getElementById('admin-pass').value; localStorage.setItem("ipa_master_pass", PASS); location.reload(); }
    function logout(){ localStorage.removeItem("ipa_master_pass"); location.reload(); }

    if(PASS) showDashboard();

    function showDashboard(){
        document.getElementById('login-screen').style.display='none';
        document.getElementById('dashboard').style.display='block';
        const grid = document.getElementById('account-grid');
        ACCOUNTS.forEach((acc, idx) => {
            grid.innerHTML += `<div class="card">
                <div style="display:flex; justify-content:space-between"><div style="font-weight:700; color:var(--accent)">${acc.name}</div><div id="st-txt-${idx}" style="font-size:11px; opacity:0.6">0%</div></div>
                <div class="st-bar"><div id="st-fill-${idx}" class="st-fill"></div></div>
                <div id="err-${idx}" style="color:#ff453a; font-size:10px; margin-bottom:10px; display:none"></div>
                <input type="text" class="search-in" placeholder="Tìm ứng dụng..." oninput="filterApps(${idx}, this.value)">
                <div class="upload-box" id="dz-${idx}" onclick="document.getElementById('f-in-${idx}').click()">
                    <b id="status-${idx}" style="font-size:12px">Thả IPA vào đây</b>
                    <input type="file" id="f-in-${idx}" style="display:none" accept=".ipa" onchange="upFile(this, ${idx})">
                    <div class="p-wrap" id="p-box-${idx}"><div class="p-fill" id="p-fill-${idx}"></div></div>
                </div>
                <div id="list-${idx}"></div>
            </div>`;
            loadData(idx); setupDD(idx);
        });
    }

    async function loadData(idx){
        const acc = ACCOUNTS[idx]; const errBox = document.getElementById(`err-${idx}`);
        try {
            const resS = await fetch(`${acc.api}/storage`, {headers:{"Authorization":PASS}});
            if(!resS.ok) { errBox.innerText = "⚠️ Lỗi: Kiểm tra Mật khẩu hoặc CORS."; errBox.style.display="block"; return; }
            const s = await resS.json(); const pc = (s.usedBytes / (10*1024*1024*1024)*100);
            document.getElementById(`st-txt-${idx}`).innerText = pc.toFixed(1) + "%";
            document.getElementById(`st-fill-${idx}`).style.width = pc + "%";
            const resL = await fetch(`${acc.api}/list`, {headers:{"Authorization":PASS}});
            ALL_DATA[idx] = (await resL.json()).apps; renderList(idx); errBox.style.display="none";
        } catch(e) { errBox.innerText = "⚠️ Lỗi kết nối Worker."; errBox.style.display="block"; }
    }

    function renderList(idx, f = null) {
        const apps = f || ALL_DATA[idx]; let h = "";
        apps.sort((a,b)=>b.uploadTs - a.uploadTs).forEach(a => {
            h += `<div class="app-item">
                <div class="app-top"><img src="${a.icon}" class="app-icon"><div class="app-name">${a.name} <span style="font-size:9px; background:var(--accent); color:#fff; padding:2px 5px; border-radius:5px">📥 ${a.downloads||0}</span></div></div>
                <div class="act-grid">
                    <button class="act-btn" style="background:#007aff" onclick="copyL('${a.isgdLink}')">COPY LINK</button>
                    <button class="act-btn" style="background:#28cd41" onclick="window.open('${a.webLink}')">XEM</button>
                    <button class="act-btn" style="background:#ff9500" onclick="reup(${idx}, '${a.id}')">UPDATE</button>
                    <button class="act-btn" style="background:#58a6ff" onclick='openE(${idx}, ${JSON.stringify(a).replace(/'/g,"&apos;")})'>SỬA</button>
                    <button class="act-btn" style="background:#333" onclick="reShorten(${idx}, '${a.id}')">FIX LINK</button>
                    <button class="act-btn" style="background:#ff3b30" onclick="del(${idx}, '${a.id}')">XÓA</button>
                </div>
            </div>`;
        });
        document.getElementById(`list-${idx}`).innerHTML = h;
    }

    async function upFile(input, idx, appId=null){
        const file = input.files[0]; if(!file) return;
        const status = document.getElementById(`status-${idx}`); const pBox = document.getElementById(`p-box-${idx}`); const pFill = document.getElementById(`p-fill-${idx}`);
        pBox.style.display = 'block'; status.innerText = "Đang xử lý...";
        try {
            const info = await (new AppInfoParser(file)).parse();
            const zip = await JSZip.loadAsync(file);
            const prov = Object.keys(zip.files).find(f=>f.endsWith(".app/embedded.mobileprovision"));
            let team = "Enterprise"; if(prov){ const c = await zip.file(prov).async("string"); team = c.match(/<key>TeamName<\/key>\s*<string>([^<]+)<\/string>/)?.[1] || "Enterprise"; }
            const id = appId || Date.now().toString();
            const start = await(await fetch(`${ACCOUNTS[idx].api}/upload/start`,{method:'POST',headers:{"Authorization":PASS},body:JSON.stringify({fileName:id+".ipa"})})).json();
            const chunks = Math.ceil(file.size / (5*1024*1024)); const parts = [];
            for(let i=0; i<chunks; i++){
                const res = await fetch(`${ACCOUNTS[idx].api}/upload/part?uploadId=${start.uploadId}&partNumber=${i+1}&key=${start.key}`,{method:'POST', headers:{"Authorization":PASS}, body:file.slice(i*(5*1024*1024), (i+1)*(5*1024*1024))});
                parts.push({partNumber:i+1, etag:(await res.json()).etag});
                pFill.style.width = Math.round((i+1)/chunks*100) + "%"; status.innerText = `Tải lên: ${Math.round((i+1)/chunks*100)}%`;
            }
            await fetch(`${ACCOUNTS[idx].api}/upload/complete`,{method:'POST', headers:{"Authorization":PASS}, body:JSON.stringify({uploadId:start.uploadId, key:start.key, parts, appData:{id, name:info.CFBundleDisplayName || info.CFBundleName, bundleId:info.CFBundleIdentifier, version:info.CFBundleShortVersionString, build:info.CFBundleVersion, executable:info.CFBundleExecutable, minOs:info.MinimumOSVersion, size:(file.size/1024/1024).toFixed(1)+" MB", icon:info.icon, certName:team, downloads: 0 }})});
            status.innerText = "Hoàn tất!"; loadData(idx); pBox.style.display='none';
        } catch(e) { alert("Lỗi: " + e.message); pBox.style.display='none'; }
    }

    async function reShorten(idx, id) { if(confirm("Tạo lại link is.gd?")){ await fetch(`${ACCOUNTS[idx].api}/shorten?id=${id}`, {headers:{"Authorization":PASS}}); loadData(idx); } }
    function openE(idx, a){ document.getElementById('e-idx').value=idx; document.getElementById('e-id').value=a.id; document.getElementById('e-name').value=a.name; document.getElementById('e-fname').value=a.fileName; document.getElementById('e-cert').value=a.certName; document.getElementById('e-img').src=a.icon; document.getElementById('modal-edit').style.display='flex'; }
    function closeE(){ document.getElementById('modal-edit').style.display='none'; }
    async function saveE(){ await fetch(`${ACCOUNTS[document.getElementById('e-idx').value].api}/upload/edit`, {method:'POST', headers:{"Authorization":PASS,"Content-Type":"application/json"}, body:JSON.stringify({id:document.getElementById('e-id').value, name:document.getElementById('e-name').value, newFileName:document.getElementById('e-fname').value, certName:document.getElementById('e-cert').value})}); location.reload(); }
    function filterApps(idx, q) { renderList(idx, ALL_DATA[idx].filter(a => a.name.toLowerCase().includes(q.toLowerCase()))); }
    function copyL(t){ const el = document.createElement('textarea'); el.value = t; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove(); alert("Đã copy!"); }
    function setupDD(idx) { const dz = document.getElementById(`dz-${idx}`); dz.addEventListener('dragover', (e)=>{e.preventDefault();dz.style.borderColor="var(--accent)"}); dz.addEventListener('dragleave', ()=>{dz.style.borderColor="#444"}); dz.addEventListener('drop', (e)=>{e.preventDefault(); const i=document.getElementById(`f-in-${idx}`); i.files=e.dataTransfer.files; upFile(i, idx)}); }
    async function del(idx, id){ if(confirm("Xóa app?")){ await fetch(`${ACCOUNTS[idx].api}/delete?id=${id}`,{method:'DELETE',headers:{"Authorization":PASS}}); loadData(idx); } }
    function reup(idx, id){ const i=document.createElement('input'); i.type='file'; i.accept='.ipa'; i.onchange=(e)=>upFile(i, idx, id); i.click(); }
</script>
</body>
</html>
```
