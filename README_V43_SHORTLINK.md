# 🔗 IPA Master V43 - Shortlink Pro Edition

![Version](https://img.shields.io/badge/Phiên_Bản-43.0_Shortlink-blue.svg)
![Feature](https://img.shields.io/badge/Rút_Gọn_Link-is.gd_Pro-orange.svg)

Bản cập nhật V43 tối ưu hóa việc quản lý link rút gọn, đảm bảo bạn luôn có link ngắn để chia sẻ kể cả khi API is.gd gặp sự cố lúc upload.

---

## 🔧 Mã nguồn Backend — `worker.js` (Tối ưu Shortlink)

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

    // --- CÔNG KHAI ---
    if (url.pathname.startsWith("/v/")) {
      const id = url.pathname.split("/v/")[1];
      const obj = await env.MY_BUCKET.get(`meta/${id}.json`);
      if (!obj) return new Response("404 Không Tìm Thấy", { status: 404 });
      return new Response(generateLuxuryView(await obj.json(), host), { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } });
    }

    if (url.pathname.startsWith("/p/")) {
      const id = url.pathname.split(".plist")[0].split("/p/")[1];
      const obj = await env.MY_BUCKET.get(`meta/${id}.json`);
      return new Response(generatePlist(await obj.json(), host), { headers: { "Content-Type": "application/xml", ...corsHeaders } });
    }

    if (url.pathname.startsWith("/f/")) {
      const fileName = url.pathname.split("/f/")[1];
      const file = await env.MY_BUCKET.get(`files/${fileName}`);
      if (!file) return new Response("Không tìm thấy file", { status: 404 });
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

    // --- BẢO MẬT ---
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

    // Endpoint tạo lại link rút gọn
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
    const data = await res.json();
    return data.shorturl || url;
  } catch (e) { return url; }
}

function generatePlist(app, host) {
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>items</key><array><dict><key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>${host}/f/${app.fileName}</string></dict></array><key>metadata</key><dict><key>bundle-identifier</key><string>${app.bundleId}</string><key>bundle-version</key><string>${app.version}</string><key>kind</key><string>software</string><key>title</key><string>${app.name}</string></dict></dict></array></dict></plist>`;
}

function generateLuxuryView(app, host) {
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${app.name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
      :root{--blue:#007aff;--bg:#000;--card:rgba(255,255,255,0.08)}
      body{background:var(--bg);color:#fff;font-family:'Outfit',sans-serif;margin:0;padding:0;min-height:100vh;overflow-x:hidden}
      .blur-bg{position:fixed;top:-50px;left:-50px;width:120%;height:120%;background:url('${app.icon}') center/cover;filter:blur(80px) brightness(0.4);z-index:-1}
      .app-wrapper{max-width:500px;margin:0 auto;padding:20px;animation:fUp 0.8s ease}
      @keyframes fUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
      .header-info{display:flex;gap:20px;align-items:center;margin-top:40px;margin-bottom:30px}
      .main-icon{width:110px;height:110px;border-radius:24px;box-shadow:0 15px 30px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1)}
      .title-box{flex:1}
      .title-box h1{margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px}
      .dev-name{color:var(--blue);font-weight:600;font-size:14px;margin:4px 0}
      .cert-tag{background:rgba(255,255,255,0.1);padding:4px 10px;border-radius:8px;font-size:10px;font-weight:700;display:inline-block;margin-top:8px;color:#aaa}
      .btn-install{background:linear-gradient(135deg,#007aff,#00c6ff);color:#fff;text-decoration:none;display:block;text-align:center;padding:16px;border-radius:20px;font-weight:800;font-size:16px;margin:25px 0;box-shadow:0 10px 25px rgba(0,122,255,0.4);transition:0.3s}
      .btn-install:active{transform:scale(0.95)}
      .btn-ipa{background:rgba(255,255,255,0.05);color:#fff;text-decoration:none;display:block;text-align:center;padding:12px;border-radius:15px;font-size:13px;font-weight:600;border:1px solid rgba(255,255,255,0.1)}
      .metrics{display:flex;justify-content:space-between;background:var(--card);padding:20px;border-radius:25px;border:1px solid rgba(255,255,255,0.05);margin:20px 0}
      .m-item{text-align:center;flex:1}.m-label{font-size:10px;color:#888;font-weight:700;margin-bottom:5px;display:block}.m-val{font-size:15px;font-weight:800}
      .section-title{font-size:18px;font-weight:800;margin:30px 0 15px}
      .whats-new{background:var(--card);padding:20px;border-radius:25px;font-size:14px;line-height:1.6;color:#ccc}
      .info-list{margin-top:20px}.info-row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:14px}
      .info-row span:first-child{color:#888}.info-row b{color:#fff}
      .footer-guide{margin-top:40px;text-align:center;font-size:12px;color:#666;padding:20px;border-top:1px solid rgba(255,255,255,0.05)}
    </style>
    </head><body>
      <div class="blur-bg"></div>
      <div class="app-wrapper">
        <div class="header-info">
          <img src="${app.icon}" class="main-icon">
          <div class="title-box">
            <h1>${app.name}</h1>
            <div class="dev-name">${app.certName}</div>
            <div class="cert-tag">ỨNG DỤNG ĐÃ ĐƯỢC KÝ</div>
          </div>
        </div>
        <div class="metrics">
          <div class="m-item"><span class="m-label">ĐÁNH GIÁ</span><span class="m-val">4.9 ★</span></div>
          <div class="m-item" style="border-left:1px solid rgba(255,255,255,0.1); border-right:1px solid rgba(255,255,255,0.1)"><span class="m-label">PHIÊN BẢN</span><span class="m-val">${app.version}</span></div>
          <div class="m-item"><span class="m-label">LƯỢT TẢI</span><span class="m-val">${app.downloads||0}+</span></div>
        </div>
        <a href="${host}/i/${app.id}" class="btn-install">CÀI ĐẶT NGAY</a>
        <a href="${app.ipaLink}" class="btn-ipa">Tải file .IPA (${app.size})</a>
        <div class="section-title">Có gì mới</div>
        <div class="whats-new">Cải tiến hiệu suất và sửa lỗi tồn đọng. Đảm bảo trải nghiệm tốt nhất trên iOS ${app.minOs}+.</div>
        <div class="section-title">Thông tin chi tiết</div>
        <div class="info-list">
          <div class="info-row"><span>Nhà phát triển</span><b>${app.certName}</b></div>
          <div class="info-row"><span>Dung lượng</span><b>${app.size}</b></div>
          <div class="info-row"><span>HĐH</span><b>iOS ${app.minOs}+</b></div>
          <div class="info-row" style="border:none"><span>Ngày phát hành</span><b>${app.releaseDate}</b></div>
        </div>
        <div class="footer-guide">Sử dụng Safari. Vào <b>Cài đặt > Chung > VPN & Quản lý thiết bị</b> để tin cậy nhà phát triển.</div>
      </div>
    </body></html>`;
}
```

---

## 🖥️ Giao diện Quản trị — `index.html` (V43 Pro)

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IPA MASTER | PRO DASHBOARD</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700;800&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/app-info-parser@1.1.4/dist/app-info-parser.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <style>
        :root { --accent: #007aff; --bg: #030305; --card: rgba(255,255,255,0.03); --border: rgba(255,255,255,0.08); --text: #fff; }
        body { 
            background: var(--bg); color: var(--text); font-family: 'Outfit', sans-serif; margin: 0; padding: 0; 
            background-image: radial-gradient(circle at 50% -20%, #1e2040 0%, #030305 80%);
            min-height: 100vh;
        }
        .navbar { backdrop-filter: blur(30px); background: rgba(0,0,0,0.6); padding: 15px 40px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 1000; }
        .logo { font-size: 22px; font-weight: 800; letter-spacing: -1px; color: #fff; }
        .container { max-width: 1400px; margin: 40px auto; padding: 0 25px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 30px; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 35px; padding: 25px; backdrop-filter: blur(20px); transition: 0.4s; }
        .st-bar { height: 8px; background: rgba(255,255,255,0.05); border-radius: 10px; margin-bottom: 25px; overflow: hidden; }
        .st-fill { height: 100%; background: linear-gradient(90deg, #007aff, #00c6ff); width: 0%; transition: 1.5s; box-shadow: 0 0 15px var(--accent); }
        .search-in { width: 100%; padding: 12px 18px; border-radius: 15px; border: 1px solid var(--border); background: rgba(255,255,255,0.05); color: #fff; margin-bottom: 15px; box-sizing: border-box; font-family: inherit; }
        .upload-box { border: 2px dashed var(--border); border-radius: 25px; padding: 30px; text-align: center; cursor: pointer; background: rgba(255,255,255,0.01); transition: 0.3s; margin-bottom: 20px; }
        .upload-box:hover { border-color: var(--accent); background: rgba(0,122,255,0.05); }
        .app-card { background: rgba(255,255,255,0.02); border-radius: 25px; padding: 18px; margin-bottom: 15px; border: 1px solid var(--border); transition: 0.3s; }
        .app-top { display: flex; gap: 15px; align-items: center; }
        .app-img { width: 55px; height: 55px; border-radius: 14px; border: 1px solid var(--border); }
        .app-name { font-weight: 800; color: var(--accent); font-size: 15px; }
        .dl-badge { background: var(--accent); padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 800; margin-left: 8px; }
        .act-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 15px; }
        .act-btn { padding: 10px 5px; border-radius: 10px; border: none; font-size: 10px; font-weight: 800; color: #fff; cursor: pointer; text-align: center; }
        .act-btn:hover { transform: scale(1.05); }
        .p-wrap { height: 6px; background: #222; border-radius: 10px; margin-top: 15px; display: none; overflow: hidden; }
        .p-fill { height: 100%; background: var(--accent); width: 0%; transition: 0.3s; }
    </style>
</head>
<body>

    <div id="login-screen" style="height:90vh; display:flex; align-items:center; justify-content:center;">
        <div class="card" style="width:340px; text-align:center;">
            <h1>IPA MASTER</h1>
            <input type="password" id="admin-pass" style="width:100%; padding:12px; margin:20px 0; border-radius:12px; border:1px solid var(--border); background:#000; color:#fff; text-align:center" placeholder="Mật khẩu Admin">
            <button style="width:100%; padding:14px; border-radius:12px; border:none; background:var(--accent); color:#fff; font-weight:800; cursor:pointer;" onclick="login()">ĐĂNG NHẬP</button>
        </div>
    </div>

    <div id="dashboard" style="display:none;">
        <nav class="navbar"><div class="logo">IPA COMMANDER PRO</div><button onclick="logout()" style="background:rgba(255,59,48,0.1); color:#ff3b30; padding:10px 20px; border-radius:15px; border:none; cursor:pointer; font-weight:800">Thoát</button></nav>
        <div class="container"><div class="grid" id="account-grid"></div></div>
    </div>

<script>
    const ACCOUNTS = [
        { name: "SaaS Storage 01", api: "https://worker-1.ios-khoindvn.workers.dev" },
        { name: "SaaS Storage 02", api: "https://worker-2.ios-khoindvn.workers.dev" }
    ];

    let PASS = localStorage.getItem("ipa_master_pass") || "";
    let ALL_DATA = {}; 

    function login(){ 
        PASS = document.getElementById('admin-pass').value;
        localStorage.setItem("ipa_master_pass", PASS); 
        location.reload(); 
    }
    function logout(){ localStorage.removeItem("ipa_master_pass"); location.reload(); }

    if(PASS) showDashboard();

    function showDashboard(){
        document.getElementById('login-screen').style.display='none';
        document.getElementById('dashboard').style.display='block';
        const grid = document.getElementById('account-grid');
        ACCOUNTS.forEach((acc, idx) => {
            grid.innerHTML += `
                <div class="card">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px">
                        <div style="font-weight:800; color:var(--accent)">${acc.name}</div>
                        <div id="st-txt-${idx}" style="font-size:11px; opacity:0.6">0%</div>
                    </div>
                    <div class="st-bar"><div id="st-fill-${idx}" class="st-fill"></div></div>
                    <input type="text" class="search-in" placeholder="Tìm ứng dụng..." oninput="filterApps(${idx}, this.value)">
                    <div class="upload-box" id="dz-${idx}" onclick="document.getElementById('f-in-${idx}').click()">
                        <b id="status-${idx}" style="font-size:13px">Thả IPA vào đây để tải lên</b>
                        <input type="file" id="f-in-${idx}" style="display:none" accept=".ipa" onchange="upFile(this, ${idx})">
                        <div class="p-wrap" id="p-box-${idx}"><div class="p-fill" id="p-fill-${idx}"></div></div>
                    </div>
                    <div id="list-${idx}"></div>
                </div>`;
            loadData(idx);
            setupDD(idx);
        });
    }

    async function loadData(idx){
        const acc = ACCOUNTS[idx];
        try {
            const s = await(await fetch(`${acc.api}/storage`, {headers:{"Authorization":PASS}})).json();
            const pc = (s.usedBytes / (10*1024*1024*1024)*100);
            document.getElementById(`st-txt-${idx}`).innerText = pc.toFixed(1) + "%";
            document.getElementById(`st-fill-${idx}`).style.width = pc + "%";
            
            const res = await(await fetch(`${acc.api}/list`, {headers:{"Authorization":PASS}})).json();
            ALL_DATA[idx] = res.apps;
            renderList(idx);
        } catch(e) { document.getElementById(`list-${idx}`).innerHTML = "⚠️ Lỗi kết nối."; }
    }

    function renderList(idx, f = null) {
        const apps = f || ALL_DATA[idx];
        let h = "";
        apps.sort((a,b)=>b.uploadTs - a.uploadTs).forEach(a => {
            h += `
            <div class="app-card">
                <div class="app-top">
                    <img src="${a.icon}" class="app-img">
                    <div style="flex:1">
                        <div class="app-name">${a.name}<span class="dl-badge">📥 ${a.downloads||0}</span></div>
                        <div style="font-size:11px; color:#888">${a.version} • ${a.size}</div>
                    </div>
                </div>
                <div class="act-grid">
                    <button class="act-btn" style="background:linear-gradient(to bottom, #007aff, #0051a8)" onclick="copyL('${a.isgdLink}')">LINK RÚT GỌN</button>
                    <button class="act-btn" style="background:#28cd41" onclick="window.open('${a.webLink}')">XEM TRANG</button>
                    <button class="act-btn" style="background:#58a6ff" onclick="reShorten(${idx}, '${a.id}')">TẠO LẠI LINK</button>
                    <button class="act-btn" style="background:#ff9500" onclick="reup(${idx}, '${a.id}')">CẬP NHẬT</button>
                    <button class="act-btn" style="background:#333" onclick="copyL('${a.ipaLink}')">LINK IPA</button>
                    <button class="act-btn" style="background:#ff3b30" onclick="del(${idx}, '${a.id}')">XÓA</button>
                </div>
            </div>`;
        });
        document.getElementById(`list-${idx}`).innerHTML = h;
    }

    async function reShorten(idx, id) {
        const btn = event.target; btn.innerText = "ĐANG TẠO...";
        const res = await fetch(`${ACCOUNTS[idx].api}/shorten?id=${id}`, {headers:{"Authorization":PASS}});
        const data = await res.json();
        if(data.success) { 
            alert("Đã tạo link mới: " + data.link); 
            loadData(idx); 
        } else { alert("Lỗi khi tạo link rút gọn!"); }
        btn.innerText = "TẠO LẠI LINK";
    }

    function filterApps(idx, q) { renderList(idx, ALL_DATA[idx].filter(a => a.name.toLowerCase().includes(q.toLowerCase()))); }

    async function upFile(input, idx, appId=null){
        const file = input.files[0]; if(!file) return;
        const status = document.getElementById(`status-${idx}`);
        const pBox = document.getElementById(`p-box-${idx}`);
        const pFill = document.getElementById(`p-fill-${idx}`);
        pBox.style.display = 'block'; status.innerText = "⚡ Đang xử lý...";

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
                pFill.style.width = Math.round((i+1)/chunks*100) + "%";
                status.innerText = `Đang tải lên: ${Math.round((i+1)/chunks*100)}%`;
            }
            await fetch(`${ACCOUNTS[idx].api}/upload/complete`,{method:'POST', headers:{"Authorization":PASS}, body:JSON.stringify({uploadId:start.uploadId, key:start.key, parts, appData:{id, name:info.CFBundleDisplayName || info.CFBundleName, bundleId:info.CFBundleIdentifier, version:info.CFBundleShortVersionString, build:info.CFBundleVersion, executable:info.CFBundleExecutable, minOs:info.MinimumOSVersion, size:(file.size/1024/1024).toFixed(1)+" MB", icon:info.icon, certName:team, downloads: 0 }})});
            pBox.style.display='none'; status.innerText = "Tải lên Hoàn tất!"; loadData(idx);
        } catch(e) { alert("Lỗi: " + e.message); status.innerText = "Lỗi Upload!"; pBox.style.display='none'; }
    }

    function setupDD(idx) {
        const dz = document.getElementById(`dz-${idx}`);
        ['dragover', 'dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, (e) => {
            e.preventDefault(); dz.style.borderColor = (evt === 'dragover' ? "var(--accent)" : "var(--border)");
            if(evt === 'drop') { const i = document.getElementById(`f-in-${idx}`); i.files = e.dataTransfer.files; upFile(i, idx); }
        }));
    }
    async function del(idx, id){ if(confirm("Xóa ứng dụng này?")){ await fetch(`${ACCOUNTS[idx].api}/delete?id=${id}`,{method:'DELETE',headers:{"Authorization":PASS}}); loadData(idx); } }
    function reup(idx, id){ const i=document.createElement('input'); i.type='file'; i.accept='.ipa'; i.onchange=(e)=>upFile(i, idx, id); i.click(); }
    function copyL(t){ const el = document.createElement('textarea'); el.value = t; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove(); alert("Đã copy liên kết!"); }
</script>
</body>
</html>
```
