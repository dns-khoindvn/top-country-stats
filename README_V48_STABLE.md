# 📦 IPA Master V48 - Minimal & Super Stable

![Version](https://img.shields.io/badge/Phiên_Bản-48.0_Stable-green.svg)
![Design](https://img.shields.io/badge/Giao_Diện-Apple_Minimal-black.svg)

Bản V48 tập trung vào sự ổn định tuyệt đối và giao diện tối giản theo đúng yêu cầu của bạn.

---

## 🔧 Mã nguồn Backend — `worker.js` (Tối giản & Ổn định)

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

    if (url.pathname.startsWith("/v/")) {
      const id = url.pathname.split("/v/")[1];
      const obj = await env.MY_BUCKET.get(`meta/${id}.json`);
      if (!obj) return new Response("404", { status: 404 });
      return new Response(generateMinimalView(await obj.json(), host), { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } });
    }

    if (url.pathname.startsWith("/p/")) {
      const id = url.pathname.split(".plist")[0].split("/p/")[1];
      const obj = await env.MY_BUCKET.get(`meta/${id}.json`);
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
      // Rút gọn link không làm chậm quá trình upload
      appData.isgdLink = `${host}/i/${appData.id}`;
      try {
        const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(appData.isgdLink)}`);
        const d = await res.json(); if(d.shorturl) appData.isgdLink = d.shorturl;
      } catch(e){}
      await env.MY_BUCKET.put(`meta/${appData.id}.json`, JSON.stringify(appData));
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (url.pathname === "/shorten") {
      const id = url.searchParams.get("id");
      const obj = await env.MY_BUCKET.get(`meta/${id}.json`);
      if (obj) {
        let meta = await obj.json();
        const raw = `${host}/i/${id}`;
        try {
          const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(raw)}`);
          const d = await res.json(); if(d.shorturl) meta.isgdLink = d.shorturl;
        } catch(e){}
        await env.MY_BUCKET.put(`meta/${id}.json`, JSON.stringify(meta));
        return new Response(JSON.stringify({ success: true, link: meta.isgdLink }), { headers: corsHeaders });
      }
      return new Response("Not Found", { status: 404, headers: corsHeaders });
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

function generatePlist(app, host) {
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>items</key><array><dict><key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>${host}/f/${app.fileName}</string></dict></array><key>metadata</key><dict><key>bundle-identifier</key><string>${app.bundleId}</string><key>bundle-version</key><string>${app.version}</string><key>kind</key><string>software</string><key>title</key><string>${app.name}</string></dict></dict></array></dict></plist>`;
}

function generateMinimalView(app, host) {
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${app.name}</title>
    <style>
      :root{--blue:#007aff;--bg:#000;--card:rgba(255,255,255,0.08)}
      body{background:var(--bg);color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:0;min-height:100vh}
      .blur-bg{position:fixed;top:-50px;left:-50px;width:120%;height:120%;background:url('${app.icon}') center/cover;filter:blur(80px) brightness(0.4);z-index:-1}
      .app-wrapper{max-width:450px;margin:0 auto;padding:20px}
      .header-info{display:flex;gap:20px;align-items:center;margin-top:40px;margin-bottom:30px}
      .main-icon{width:110px;height:110px;border-radius:24px;box-shadow:0 15px 30px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1)}
      .title-box h1{margin:0;font-size:24px;font-weight:700}
      .dev-name{color:var(--blue);font-weight:500;font-size:14px;margin:4px 0}
      .btn-install{background:var(--blue);color:#fff;text-decoration:none;display:block;text-align:center;padding:16px;border-radius:20px;font-weight:700;font-size:16px;margin:25px 0}
      .btn-ipa{background:rgba(255,255,255,0.1);color:#fff;text-decoration:none;display:block;text-align:center;padding:12px;border-radius:15px;font-size:13px}
      .metrics{display:flex;justify-content:space-between;background:var(--card);padding:20px;border-radius:25px;margin:20px 0}
      .m-item{text-align:center;flex:1}.m-label{font-size:10px;color:#888;font-weight:700;margin-bottom:5px;display:block}.m-val{font-size:15px;font-weight:700}
      .section-title{font-size:19px;font-weight:700;margin:30px 0 15px}
      .info-row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:14px}.info-row span:first-child{color:#888}
      .footer-guide{margin-top:40px;text-align:center;font-size:12px;color:#666;padding:20px}
    </style>
    </head><body><div class="blur-bg"></div><div class="app-wrapper">
      <div class="header-info"><img src="${app.icon}" class="main-icon"><div class="title-box"><h1>${app.name}</h1><div class="dev-name">${app.certName}</div></div></div>
      <div class="metrics"><div class="m-item"><span class="m-label">ĐÁNH GIÁ</span><span class="m-val">4.9 ★</span></div><div class="m-item" style="border-left:1px solid rgba(255,255,255,0.1); border-right:1px solid rgba(255,255,255,0.1)"><span class="m-label">PHIÊN BẢN</span><span class="m-val">${app.version}</span></div><div class="m-item"><span class="m-label">LƯỢT TẢI</span><span class="m-val">${app.downloads||0}+</span></div></div>
      <a href="${host}/i/${app.id}" class="btn-install">CÀI ĐẶT</a><a href="${app.ipaLink}" class="btn-ipa">Tải IPA (${app.size})</a>
      <div class="section-title">Thông tin chi tiết</div><div class="info-list">
        <div class="info-row"><span>Nhà cung cấp</span><b>${app.certName}</b></div><div class="info-row"><span>Dung lượng</span><b>${app.size}</b></div><div class="info-row"><span>HĐH</span><b>iOS ${app.minOs}+</b></div><div class="info-row" style="border:none"><span>Ngày phát hành</span><b>${app.releaseDate}</b></div>
      </div><div class="footer-guide">Mở bằng Safari. Tin cậy chứng chỉ trong Cài đặt hệ thống.</div>
    </div></body></html>`;
}
```

---

## 🖥️ Giao diện Frontend — `index.html` (Đủ 3 Tài Khoản)

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>IPA MASTER | STABLE DASHBOARD</title>
    <style>
        :root { --accent: #007aff; --bg: #000; --card: #1c1c1e; --border: #38383a; --text: #fff; }
        body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; }
        .navbar { backdrop-filter: blur(20px); background: rgba(0,0,0,0.8); padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 0.5px solid var(--border); position: sticky; top: 0; z-index: 1000; }
        .container { max-width: 1400px; margin: 30px auto; padding: 0 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 20px; }
        .card { background: var(--card); border-radius: 25px; padding: 20px; border: 0.5px solid var(--border); }
        .st-bar { height: 6px; background: #333; border-radius: 10px; margin: 15px 0; overflow: hidden; }
        .st-fill { height: 100%; background: var(--accent); width: 0%; transition: 1.5s; }
        .upload-box { border: 1.5px dashed #444; border-radius: 20px; padding: 20px; text-align: center; cursor: pointer; margin-bottom: 15px; font-size: 13px; }
        .app-item { background: #2c2c2e; border-radius: 18px; padding: 12px; margin-bottom: 10px; }
        .app-top { display: flex; align-items: center; gap: 10px; }
        .app-icon { width: 50px; height: 50px; border-radius: 10px; }
        .app-name { font-weight: 600; font-size: 14px; color: var(--accent); flex: 1; }
        .act-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 10px; }
        .act-btn { padding: 8px; border-radius: 8px; border: none; font-size: 10px; font-weight: 700; color: #fff; cursor: pointer; background: #3a3a3c; }
    </style>
    <script src="https://unpkg.com/app-info-parser@1.1.4/dist/app-info-parser.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
</head>
<body>
    <div id="login-screen" style="height:90vh; display:flex; align-items:center; justify-content:center;">
        <div class="card" style="width:300px; text-align:center;">
            <h2>IPA MASTER</h2>
            <input type="password" id="admin-pass" style="width:100%; padding:12px; margin:15px 0; border-radius:10px; border:none; background:#000; color:#fff; text-align:center" placeholder="Mật khẩu Admin">
            <button style="width:100%; padding:12px; border-radius:10px; border:none; background:var(--accent); color:#fff; font-weight:700; cursor:pointer" onclick="login()">VÀO HỆ THỐNG</button>
        </div>
    </div>
    <div id="dashboard" style="display:none;">
        <nav class="navbar"><b>Kho IPA Pro</b><button onclick="logout()" style="color:#ff453a; background:none; border:none; font-weight:700; cursor:pointer">Thoát</button></nav>
        <div class="container"><div class="grid" id="account-grid"></div></div>
    </div>
<script>
    // --- ĐÃ NẠP ĐỦ 3 TÀI KHOẢN CỦA BẠN ---
    const ACCOUNTS = [
        { name: "Storage 01", api: "https://dev.ipadl.workers.dev" },
        { name: "Storage 02", api: "https://dev.ipadl1.workers.dev" },
        { name: "Storage 03", api: "https://dev.ipadl2.workers.dev" }
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
                <div style="display:flex; justify-content:space-between"><b>${acc.name}</b><div id="st-txt-${idx}" style="font-size:11px; opacity:0.6">0%</div></div>
                <div class="st-bar"><div id="st-fill-${idx}" class="st-fill"></div></div>
                <div class="upload-box" onclick="document.getElementById('f-in-${idx}').click()">
                    <span id="status-${idx}">Tải lên IPA mới</span>
                    <input type="file" id="f-in-${idx}" style="display:none" accept=".ipa" onchange="upFile(this, ${idx})">
                </div>
                <div id="list-${idx}"></div>
            </div>`;
            loadData(idx);
        });
    }

    async function loadData(idx){
        const acc = ACCOUNTS[idx];
        try {
            const resS = await fetch(`${acc.api}/storage`, {headers:{"Authorization":PASS}});
            const s = await resS.json(); const pc = (s.usedBytes / (10*1024*1024*1024)*100);
            document.getElementById(`st-txt-${idx}`).innerText = pc.toFixed(1) + "%";
            document.getElementById(`st-fill-${idx}`).style.width = pc + "%";
            const resL = await fetch(`${acc.api}/list`, {headers:{"Authorization":PASS}});
            ALL_DATA[idx] = (await resL.json()).apps; renderList(idx);
        } catch(e) {}
    }

    function renderList(idx, f = null) {
        const apps = f || ALL_DATA[idx]; let h = "";
        apps.sort((a,b)=>b.uploadTs - a.uploadTs).forEach(a => {
            h += `<div class="app-item">
                <div class="app-top"><img src="${a.icon}" class="app-icon"><div class="app-name">${a.name} <span style="font-size:9px; color:#888; margin-left:5px">📥 ${a.downloads||0}</span></div></div>
                <div class="act-grid">
                    <button class="act-btn" style="background:#007aff" onclick="copyL('${a.isgdLink}')">LINK</button>
                    <button class="act-btn" style="background:#28cd41" onclick="window.open('${a.webLink}')">XEM</button>
                    <button class="act-btn" style="background:#ff3b30" onclick="del(${idx}, '${a.id}')">XÓA</button>
                </div>
            </div>`;
        });
        document.getElementById(`list-${idx}`).innerHTML = h;
    }

    async function upFile(input, idx, appId=null){
        const file = input.files[0]; if(!file) return;
        const status = document.getElementById(`status-${idx}`);
        status.innerText = "Đang tải lên...";
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
            }
            await fetch(`${ACCOUNTS[idx].api}/upload/complete`,{method:'POST', headers:{"Authorization":PASS}, body:JSON.stringify({uploadId:start.uploadId, key:start.key, parts, appData:{id, name:info.CFBundleDisplayName || info.CFBundleName, bundleId:info.CFBundleIdentifier, version:info.CFBundleShortVersionString, build:info.CFBundleVersion, executable:info.CFBundleExecutable, minOs:info.MinimumOSVersion, size:(file.size/1024/1024).toFixed(1)+" MB", icon:info.icon, certName:team, downloads: 0 }})});
            status.innerText = "Xong!"; loadData(idx);
        } catch(e) { alert("Lỗi!"); status.innerText = "Thử lại"; }
    }
    function copyL(t){ const el = document.createElement('textarea'); el.value = t; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove(); alert("Đã copy!"); }
    async function del(idx, id){ if(confirm("Xóa app?")){ await fetch(`${ACCOUNTS[idx].api}/delete?id=${id}`,{method:'DELETE',headers:{"Authorization":PASS}}); loadData(idx); } }
</script>
</body>
</html>
```
