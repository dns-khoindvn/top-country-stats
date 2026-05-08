# 📦 IPA Master V39 - Premium UI Edition

![Version](https://img.shields.io/badge/Version-39.0_UI-blueviolet.svg)
![Design](https://img.shields.io/badge/Design-Glassmorphism-brightgreen.svg)

Phiên bản V39 tập trung vào việc lột xác hoàn toàn giao diện (UI/UX), mang lại trải nghiệm đẳng cấp và chuyên nghiệp như một nền tảng SaaS cao cấp.

---

## 🔧 Mã nguồn Backend (Cập nhật UI Trang Tải App) — `worker.js`

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
      if (!obj) return new Response("404 Not Found", { status: 404 });
      return new Response(generatePremiumView(await obj.json(), host), { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } });
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
      appData.downloads = appData.downloads || 0;
      appData.uploadTs = Date.now();
      appData.releaseDate = new Date().toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' });
      const bridgeUrl = `${host}/i/${appData.id}`;
      try {
        const isgd = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(bridgeUrl)}`);
        appData.isgdLink = (await isgd.json()).shorturl || bridgeUrl;
      } catch (e) { appData.isgdLink = bridgeUrl; }
      await env.MY_BUCKET.put(`meta/${appData.id}.json`, JSON.stringify(appData));
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (url.pathname === "/list") {
      const cursor = url.searchParams.get("cursor") || undefined;
      const list = await env.MY_BUCKET.list({ prefix: "meta/", limit: 50, cursor });
      const apps = [];
      for (const o of list.objects) {
        try {
          const obj = await env.MY_BUCKET.get(o.key);
          if (obj) apps.push(await obj.json());
        } catch(e) {}
      }
      return new Response(JSON.stringify({ apps, nextCursor: list.truncated ? list.cursor : null }), { headers: corsHeaders });
    }

    if (url.pathname === "/delete" && request.method === "DELETE") {
      const id = url.searchParams.get("id");
      const obj = await env.MY_BUCKET.get(`meta/${id}.json`);
      if (obj) {
        const m = await obj.json();
        await env.MY_BUCKET.delete(`files/${m.fileName}`);
        await env.MY_BUCKET.delete(`meta/${id}.json`);
      }
      return new Response("OK", { headers: corsHeaders });
    }
    return new Response("Not Found", { status: 404 });
  }
};

function generatePlist(app, host) {
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>items</key><array><dict><key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>${host}/f/${app.fileName}</string></dict></array><key>metadata</key><dict><key>bundle-identifier</key><string>${app.bundleId}</string><key>bundle-version</key><string>${app.version}</string><key>kind</key><string>software</string><key>title</key><string>${app.name}</string></dict></dict></array></dict></plist>`;
}

function generatePremiumView(app, host) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${app.name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
      :root{--blue:#007aff;--bg:#000}
      body{background:var(--bg);color:#fff;font-family:'Outfit',sans-serif;margin:0;padding:0;display:flex;justify-content:center;min-height:100vh;overflow-x:hidden}
      .blur-bg{position:fixed;top:-50px;left:-50px;width:150%;height:150%;background:url('${app.icon}') no-repeat center center;background-size:cover;filter:blur(80px) opacity(0.3);z-index:-1}
      .container{width:100%;max-width:450px;padding:40px 20px;animation:slideUp 0.8s cubic-bezier(0.2,1,0.3,1)}
      @keyframes slideUp{from{transform:translateY(50px);opacity:0}to{transform:translateY(0);opacity:1}}
      .card{background:rgba(255,255,255,0.08);backdrop-filter:blur(20px);border-radius:40px;padding:40px 25px;border:1px solid rgba(255,255,255,0.1);text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.5)}
      .icon{width:120px;height:120px;border-radius:28px;box-shadow:0 15px 35px rgba(0,0,0,0.4);margin-bottom:20px;border:1px solid rgba(255,255,255,0.1)}
      h1{font-size:28px;margin:10px 0;font-weight:800}
      .cert{background:rgba(0,122,255,0.15);color:var(--blue);padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;display:inline-block;margin-bottom:30px}
      .btn{display:block;text-decoration:none;padding:18px;border-radius:20px;font-weight:800;margin:12px 0;transition:0.3s cubic-bezier(0.2,1,0.3,1)}
      .btn:active{transform:scale(0.95)}
      .btn-in{background:linear-gradient(135deg, #007aff, #00c6ff);color:#fff;box-shadow:0 10px 25px rgba(0,122,255,0.3)}
      .btn-ipa{background:rgba(255,255,255,0.05);color:#fff;border:1px solid rgba(255,255,255,0.1)}
      .stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:30px;padding-top:30px;border-top:1px solid rgba(255,255,255,0.1)}
      .stat-item{font-size:11px;color:#aaa}
      .stat-val{display:block;font-size:14px;font-weight:600;color:#fff;margin-top:4px}
      .guide{margin-top:30px;font-size:12px;color:#888;line-height:1.6;background:rgba(255,255,255,0.03);padding:20px;border-radius:20px}
    </style>
    </head><body>
    <div class="blur-bg"></div>
    <div class="container">
      <div class="card">
        <img src="${app.icon}" class="icon">
        <h1>${app.name}</h1>
        <div class="cert">${app.certName}</div>
        
        <a href="${host}/i/${app.id}" class="btn btn-in">Install Application</a>
        <a href="${app.ipaLink}" class="btn btn-ipa">Download IPA (${app.size})</a>
        
        <div class="stats">
          <div class="stat-item">VERSION<span class="stat-val">${app.version}</span></div>
          <div class="stat-item">DOWNLOADS<span class="stat-val">${app.downloads || 0}</span></div>
          <div class="stat-item">iOS REQ<span class="stat-val">${app.minOs}+</span></div>
        </div>
      </div>
      <div class="guide">
        <b>Installation Guide:</b> Use Safari. After tapping Install, wait for the icon to appear on home screen. Then go to <b>Settings > General > VPN & Device Management</b> and trust <b>${app.certName}</b>.
      </div>
    </div>
    </body></html>`;
}
```

---

## 🖥️ 2. Giao diện Quản trị Modern — `index.html` (V39 UI)

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IPA MASTER | COMMAND CENTER</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/app-info-parser@1.1.4/dist/app-info-parser.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <style>
        :root { 
            --accent: #007aff; 
            --bg: #050505; 
            --card: rgba(255,255,255,0.04); 
            --border: rgba(255,255,255,0.1); 
            --text: #ffffff;
            --text-dim: #999;
        }
        
        body { 
            background: var(--bg); 
            color: var(--text); 
            font-family: 'Outfit', sans-serif; 
            margin: 0; 
            padding: 0; 
            overflow-x: hidden;
            background-image: radial-gradient(circle at 50% -20%, #1a1a2e 0%, #050505 80%);
            min-height: 100vh;
        }

        .navbar {
            backdrop-filter: blur(20px);
            background: rgba(0,0,0,0.5);
            padding: 15px 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border);
            position: sticky;
            top: 0;
            z-index: 1000;
        }

        .logo { font-size: 20px; font-weight: 700; letter-spacing: -1px; background: linear-gradient(to right, #fff, #888); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

        .container { max-width: 1400px; margin: 30px auto; padding: 0 20px; }

        .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 25px; }

        .card {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 30px;
            padding: 25px;
            backdrop-filter: blur(10px);
            transition: 0.4s cubic-bezier(0.2,1,0.3,1);
            animation: fadeIn 0.8s ease;
        }
        @keyframes fadeIn { from{opacity:0; transform:translateY(20px)} to{opacity:1; transform:translateY(0)} }

        .acc-info { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
        .acc-name { font-size: 18px; font-weight: 700; color: var(--accent); }
        .storage-txt { font-size: 11px; color: var(--text-dim); }

        .storage-bar { height: 6px; background: rgba(255,255,255,0.05); border-radius: 10px; margin: 10px 0 25px; overflow: hidden; }
        .storage-fill { 
            height: 100%; 
            background: linear-gradient(90deg, #007aff, #00c6ff); 
            border-radius: 10px; 
            width: 0%; 
            transition: 1.5s cubic-bezier(0.2,1,0.3,1); 
            box-shadow: 0 0 15px rgba(0,122,255,0.4);
        }

        .search-bar {
            background: rgba(255,255,255,0.05);
            border: 1px solid var(--border);
            border-radius: 15px;
            padding: 12px 15px;
            color: #fff;
            width: 100%;
            box-sizing: border-box;
            margin-bottom: 15px;
            font-family: inherit;
        }

        .drop-zone {
            border: 2px dashed var(--border);
            border-radius: 20px;
            padding: 30px;
            text-align: center;
            cursor: pointer;
            transition: 0.3s;
            background: rgba(255,255,255,0.02);
            margin-bottom: 20px;
        }
        .drop-zone:hover { border-color: var(--accent); background: rgba(0,122,255,0.05); }

        .app-item {
            background: rgba(255,255,255,0.03);
            border-radius: 20px;
            padding: 15px;
            margin-bottom: 12px;
            border: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 15px;
            transition: 0.3s;
        }
        .app-item:hover { transform: translateX(5px); border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.06); }
        
        .app-icon { width: 55px; height: 55px; border-radius: 14px; border: 1px solid var(--border); }
        .app-meta { flex: 1; }
        .app-title { font-weight: 700; font-size: 15px; margin-bottom: 2px; display: block; }
        .app-sub { font-size: 11px; color: var(--text-dim); }

        .btn-group { display: flex; gap: 6px; margin-top: 10px; }
        .btn-act { 
            padding: 8px; border-radius: 8px; border: 1px solid var(--border); 
            background: rgba(255,255,255,0.05); color: #fff; font-size: 10px; font-weight: 600;
            cursor: pointer; transition: 0.2s; flex: 1; text-align: center;
        }
        .btn-act:hover { background: var(--accent); border-color: var(--accent); }

        /* Login */
        .login-wrap { height: 80vh; display: flex; align-items: center; justify-content: center; }
        .login-box { width: 350px; text-align: center; }
        .btn-login { 
            width: 100%; padding: 15px; border-radius: 15px; border: none; 
            background: var(--accent); color: #fff; font-weight: 700; cursor: pointer; margin-top: 15px;
            box-shadow: 0 10px 20px rgba(0,122,255,0.2);
        }

        .p-bar { height: 4px; background: #222; border-radius: 10px; margin-top: 10px; display: none; overflow: hidden; }
        .p-fill { height: 100%; background: var(--accent); width: 0%; transition: 0.2s; }
    </style>
</head>
<body>

    <div id="login-screen" class="login-wrap">
        <div class="card login-box">
            <h1 style="margin-top:0">IPA Master</h1>
            <p style="color:var(--text-dim); font-size:14px">Vào bảng điều khiển trung tâm</p>
            <input type="password" id="admin-pass" class="search-bar" placeholder="Mật khẩu Admin" style="text-align:center; margin-top:20px">
            <button class="btn-login" onclick="login()">BẮT ĐẦU</button>
        </div>
    </div>

    <div id="dashboard" style="display:none;">
        <nav class="navbar">
            <div class="logo">COMMAND CENTER V39</div>
            <button onclick="logout()" style="background:rgba(255,0,0,0.1); border:1px solid rgba(255,0,0,0.2); color:#ff453a; padding:8px 15px; border-radius:12px; cursor:pointer; font-weight:600">Thoát</button>
        </nav>
        
        <div class="container">
            <div class="dashboard-grid" id="account-grid"></div>
        </div>
    </div>

<script>
    const ACCOUNTS = [
        { name: "SaaS Storage 01", api: "https://worker-1.ios-khoindvn.workers.dev" },
        { name: "SaaS Storage 02", api: "https://worker-2.ios-khoindvn.workers.dev" }
    ];

    let PASS = localStorage.getItem("ipa_master_pass") || "";
    let ALL_DATA = {};

    function login(){ 
        const p = document.getElementById('admin-pass').value;
        localStorage.setItem("ipa_master_pass", p); 
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
                    <div class="acc-info">
                        <div class="acc-name">${acc.name}</div>
                        <div id="st-txt-${idx}" class="storage-txt">0% used</div>
                    </div>
                    <div class="storage-bar"><div id="st-fill-${idx}" class="storage-fill"></div></div>
                    
                    <input type="text" class="search-bar" placeholder="Tìm ứng dụng..." oninput="filterApps(${idx}, this.value)">
                    
                    <div class="drop-zone" id="dz-${idx}" onclick="document.getElementById('f-in-${idx}').click()">
                        <div style="font-size:24px; margin-bottom:10px">☁️</div>
                        <b id="status-${idx}" style="font-size:13px">Thả IPA vào đây để Upload</b>
                        <input type="file" id="f-in-${idx}" style="display:none" accept=".ipa" onchange="upFile(this, ${idx})">
                        <div class="p-bar" id="p-box-${idx}"><div class="p-fill" id="p-fill-${idx}"></div></div>
                    </div>

                    <div id="list-${idx}"></div>
                    <div id="more-${idx}" style="text-align:center; margin-top:15px"></div>
                </div>`;
            loadData(idx);
            setupDragDrop(idx);
        });
    }

    async function loadData(idx, cursor = null){
        const acc = ACCOUNTS[idx];
        try {
            if(!cursor) {
                const s = await(await fetch(`${acc.api}/storage`, {headers:{"Authorization":PASS}})).json();
                const pc = Math.min(100, (s.usedBytes / (10*1024*1024*1024)*100));
                document.getElementById(`st-txt-${idx}`).innerText = `${pc.toFixed(1)}% of 10GB used`;
                document.getElementById(`st-fill-${idx}`).style.width = pc + "%";
            }
            const res = await(await fetch(`${acc.api}/list?cursor=${cursor||""}`, {headers:{"Authorization":PASS}})).json();
            if(!ALL_DATA[idx]) ALL_DATA[idx] = [];
            res.apps.forEach(a => { if(!ALL_DATA[idx].find(x=>x.id===a.id)) ALL_DATA[idx].push(a); });
            renderList(idx);
            
            const more = document.getElementById(`more-${idx}`);
            if(res.nextCursor) more.innerHTML = `<button class="btn-act" onclick="loadData(${idx}, '${res.nextCursor}')">LOAD MORE</button>`;
            else more.innerHTML = "";
        } catch(e) { document.getElementById(`list-${idx}`).innerHTML = "<p style='color:red; font-size:12px'>Lỗi kết nối API</p>"; }
    }

    function renderList(idx, filtered = null) {
        const apps = filtered || ALL_DATA[idx];
        let h = "";
        apps.sort((a,b)=>b.uploadTs - a.uploadTs).forEach(a => {
            h += `
            <div class="app-item">
                <img src="${a.icon}" class="app-icon">
                <div class="app-meta">
                    <span class="app-title">${a.name}</span>
                    <span class="app-sub">${a.version} • ${a.size} • 📥 ${a.downloads||0}</span>
                    <div class="btn-group">
                        <div class="btn-act" onclick="copyLink('${a.isgdLink}')">COPY</div>
                        <div class="btn-act" onclick="window.open('${a.webLink}')">VIEW</div>
                        <div class="btn-act" style="color:#ff453a" onclick="del(${idx}, '${a.id}')">DEL</div>
                    </div>
                </div>
            </div>`;
        });
        document.getElementById(`list-${idx}`).innerHTML = h;
    }

    function filterApps(idx, q) {
        const query = q.toLowerCase();
        const filtered = ALL_DATA[idx].filter(a => a.name.toLowerCase().includes(query));
        renderList(idx, filtered);
    }

    function setupDragDrop(idx) {
        const dz = document.getElementById(`dz-${idx}`);
        dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = "var(--accent)"; });
        dz.addEventListener('dragleave', () => dz.style.borderColor = "var(--border)");
        dz.addEventListener('drop', (e) => {
            e.preventDefault();
            const files = e.dataTransfer.files;
            if(files.length) {
                const input = document.getElementById(`f-in-${idx}`);
                input.files = files;
                upFile(input, idx);
            }
        });
    }

    async function upFile(input, idx, appId=null){
        const file = input.files[0]; if(!file) return;
        const acc = ACCOUNTS[idx];
        const status = document.getElementById(`status-${idx}`);
        const pBox = document.getElementById(`p-box-${idx}`);
        const pFill = document.getElementById(`p-fill-${idx}`);
        
        pBox.style.display = 'block';
        status.innerText = "Analyzing IPA...";

        try {
            const info = await (new AppInfoParser(file)).parse();
            const zip = await JSZip.loadAsync(file);
            const prov = Object.keys(zip.files).find(f=>f.endsWith(".app/embedded.mobileprovision"));
            let team = "Enterprise"; 
            if(prov){ 
                const content = await zip.file(prov).async("string");
                team = content.match(/<key>TeamName<\/key>\s*<string>([^<]+)<\/string>/)?.[1] || "Enterprise"; 
            }

            const id = appId || Date.now().toString();
            status.innerText = "Starting Upload...";
            const startReq = await fetch(`${acc.api}/upload/start`,{method:'POST',headers:{"Authorization":PASS},body:JSON.stringify({fileName:id+".ipa"})});
            const start = await startReq.json();
            
            const chunkSize = 5 * 1024 * 1024;
            const chunks = Math.ceil(file.size / chunkSize); 
            const parts = [];

            for(let i=0; i<chunks; i++){
                const chunk = file.slice(i * chunkSize, (i+1) * chunkSize);
                const res = await fetch(`${acc.api}/upload/part?uploadId=${start.uploadId}&partNumber=${i+1}&key=${start.key}`,{
                    method:'POST', headers:{"Authorization":PASS}, body:chunk
                });
                const partData = await res.json();
                parts.push({partNumber:i+1, etag:partData.etag});
                pFill.style.width = Math.round((i+1)/chunks*100) + "%";
                status.innerText = `Uploading: ${Math.round((i+1)/chunks*100)}%`;
            }

            status.innerText = "Finalizing...";
            await fetch(`${acc.api}/upload/complete`,{
                method:'POST', headers:{"Authorization":PASS},
                body:JSON.stringify({
                    uploadId:start.uploadId, key:start.key, parts,
                    appData:{
                        id, name:info.CFBundleDisplayName || info.CFBundleName,
                        bundleId:info.CFBundleIdentifier, version:info.CFBundleShortVersionString,
                        build:info.CFBundleVersion, executable:info.CFBundleExecutable,
                        minOs:info.MinimumOSVersion, size:(file.size/1024/1024).toFixed(1)+" MB",
                        icon:info.icon, certName:team, downloads: 0
                    }
                })
            });
            
            pBox.style.display='none';
            status.innerText = "Success!";
            setTimeout(() => { status.innerText = "Thả IPA vào đây để Upload"; loadData(idx); }, 2000);
        } catch(e) {
            alert("Error: " + e.message);
            status.innerText = "Upload Failed!";
            pBox.style.display='none';
        }
    }

    async function del(idx, id){ 
        if(confirm("Xác nhận xóa?")){ 
            await fetch(`${ACCOUNTS[idx].api}/delete?id=${id}`,{method:'DELETE',headers:{"Authorization":PASS}}); 
            ALL_DATA[idx] = ALL_DATA[idx].filter(a => a.id !== id);
            renderList(idx);
        } 
    }

    function copyLink(t){ 
        const el = document.createElement('textarea'); el.value = t; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove();
        alert("Copied to clipboard!"); 
    }
</script>
</body>
</html>
```
