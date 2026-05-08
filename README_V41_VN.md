# 📦 IPA Master V41 - Bản Tiếng Việt Hoàn Chỉnh

![Version](https://img.shields.io/badge/Phiên_Bản-41.0_VN-red.svg)
![Language](https://img.shields.io/badge/Ngôn_Ngữ-Tiếng_Việt-blue.svg)

Bản cập nhật này đã được Việt hóa 100% giao diện, từ Dashboard quản trị đến trang chi tiết ứng dụng.

---

## 🔧 Mã nguồn Backend — `worker.js` (Việt Hóa)

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
      if (!obj) return new Response("404 Không Tìm Thấy", { status: 404 });
      return new Response(generateVNView(await obj.json(), host), { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } });
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

    const auth = request.headers.get("Authorization");
    if (auth !== authPass) return new Response("Không được phép", { status: 401, headers: corsHeaders });

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
      const bridgeUrl = `${host}/i/${appData.id}`;
      try {
        const isgd = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(bridgeUrl)}`);
        appData.isgdLink = (await isgd.json()).shorturl || bridgeUrl;
      } catch (e) { appData.isgdLink = bridgeUrl; }
      await env.MY_BUCKET.put(`meta/${appData.id}.json`, JSON.stringify(appData));
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
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
    return new Response("Không tìm thấy", { status: 404 });
  }
};

function generatePlist(app, host) {
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>items</key><array><dict><key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>${host}/f/${app.fileName}</string></dict></array><key>metadata</key><dict><key>bundle-identifier</key><string>${app.bundleId}</string><key>bundle-version</key><string>${app.version}</string><key>kind</key><string>software</string><key>title</key><string>${app.name}</string></dict></dict></array></dict></plist>`;
}

function generateVNView(app, host) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${app.name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
      :root{--blue:#007aff;--bg:#000}body{background:var(--bg);color:#fff;font-family:'Outfit',sans-serif;margin:0;padding:0;display:flex;justify-content:center;min-height:100vh;overflow:hidden}
      .blur{position:fixed;top:0;left:0;width:100%;height:100%;background:url('${app.icon}') no-repeat center center;background-size:cover;filter:blur(80px) opacity(0.3);z-index:-1}
      .container{width:100%;max-width:450px;padding:40px 20px;z-index:1}.card{background:rgba(255,255,255,0.1);backdrop-filter:blur(20px);border-radius:35px;padding:40px 25px;border:1px solid rgba(255,255,255,0.1);text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.5)}
      .icon{width:110px;height:110px;border-radius:24px;margin-bottom:15px;box-shadow:0 10px 25px rgba(0,0,0,0.3)}h1{font-size:24px;margin:10px 0}.cert{background:rgba(0,122,255,0.15);color:var(--blue);padding:5px 15px;border-radius:20px;font-size:11px;font-weight:700;display:inline-block;margin-bottom:25px}
      .btn{display:block;text-decoration:none;padding:16px;border-radius:18px;font-weight:700;margin:10px 0;transition:0.3s}.btn-in{background:linear-gradient(135deg,#007aff,#00c6ff);color:#fff}.btn-ipa{background:rgba(255,255,255,0.05);color:#fff;border:1px solid rgba(255,255,255,0.1)}
      .stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:25px;padding-top:25px;border-top:1px solid rgba(255,255,255,0.1)}.stat-i{font-size:10px;color:#888}.stat-v{display:block;font-size:13px;font-weight:700;color:#fff;margin-top:2px}
      .guide{margin-top:25px;font-size:12px;color:#888;line-height:1.6;background:rgba(255,255,255,0.03);padding:15px;border-radius:20px}
    </style>
    </head><body><div class="blur"></div><div class="container"><div class="card"><img src="${app.icon}" class="icon"><h1>${app.name}</h1><div class="cert">${app.certName}</div>
    <a href="${host}/i/${app.id}" class="btn btn-in">Cài đặt Ứng dụng</a><a href="${app.ipaLink}" class="btn btn-ipa">Tải file .IPA (${app.size})</a>
    <div class="stats"><div class="stat-i">PHIÊN BẢN<span class="stat-v">${app.version}</span></div><div class="stat-i">LƯỢT TẢI<span class="stat-v">${app.downloads||0}</span></div><div class="stat-i">HĐH iOS<span class="stat-v">${app.minOs}+</span></div></div>
    </div><div class="guide"><b>Yêu cầu Safari:</b> Sau khi cài, hãy tin cậy chứng chỉ tại <b>Cài đặt > Cài đặt chung > VPN & Quản lý thiết bị</b>.</div></div></body></html>`;
}
```

---

## 🖥️ Giao diện Quản trị — `index.html` (Việt Hóa)

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IPA MASTER | QUẢN TRỊ VIÊN</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/app-info-parser@1.1.4/dist/app-info-parser.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <style>
        :root { --accent: #007aff; --bg: #050505; --card: rgba(255,255,255,0.04); --border: rgba(255,255,255,0.1); --text: #fff; --gray: #999; }
        body { background: var(--bg); color: var(--text); font-family: 'Outfit', sans-serif; margin: 0; padding: 0; background-image: radial-gradient(circle at 50% -20%, #1a1a2e 0%, #050505 80%); min-height: 100vh; }
        .navbar { backdrop-filter: blur(20px); background: rgba(0,0,0,0.5); padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; }
        .logo { font-size: 20px; font-weight: 700; background: linear-gradient(to right, #fff, #888); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .container { max-width: 1400px; margin: 30px auto; padding: 0 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 25px; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 30px; padding: 20px; backdrop-filter: blur(15px); transition: 0.3s; position: relative; }
        .acc-h { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 15px; }
        .storage-bar { height: 6px; background: rgba(255,255,255,0.05); border-radius: 10px; margin-bottom: 20px; overflow: hidden; }
        .storage-fill { height: 100%; background: linear-gradient(90deg, #007aff, #00c6ff); width: 0%; transition: 1s; box-shadow: 0 0 10px var(--accent); }
        .tools { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 15px; }
        .in-search { flex: 1; padding: 10px 15px; border-radius: 12px; border: 1px solid var(--border); background: rgba(255,255,255,0.05); color: #fff; font-family: inherit; }
        .sel-tool { padding: 10px; border-radius: 12px; border: 1px solid var(--border); background: #111; color: #fff; font-size: 12px; cursor: pointer; }
        .dz { border: 2px dashed var(--border); border-radius: 20px; padding: 25px; text-align: center; cursor: pointer; background: rgba(255,255,255,0.02); margin-bottom: 20px; transition: 0.3s; }
        .dz:hover { border-color: var(--accent); background: rgba(0,122,255,0.05); }
        .app-item { background: rgba(255,255,255,0.03); border-radius: 20px; padding: 15px; margin-bottom: 10px; border: 1px solid var(--border); transition: 0.3s; }
        .app-item:hover { transform: translateX(5px); background: rgba(255,255,255,0.06); }
        .app-top { display: flex; gap: 12px; align-items: center; }
        .app-icon { width: 55px; height: 55px; border-radius: 14px; border: 1px solid var(--border); }
        .app-info { flex: 1; }
        .app-name { font-weight: 700; color: var(--accent); display: block; font-size: 15px; }
        .app-sub { font-size: 11px; color: var(--gray); margin-top: 2px; }
        .badge { background: var(--accent); padding: 1px 6px; border-radius: 8px; font-size: 9px; color: #fff; margin-left: 5px; }
        .actions { display: flex; gap: 4px; margin-top: 10px; flex-wrap: wrap; }
        .btn-s { padding: 8px 4px; border-radius: 8px; border: none; font-size: 10px; font-weight: 700; color: #fff; cursor: pointer; flex: 1; text-align: center; transition: 0.2s; }
        #edit-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.9); align-items: center; justify-content: center; z-index: 1000; }
        .modal-c { background: #161b22; padding: 25px; border-radius: 25px; width: 90%; max-width: 400px; border: 1px solid var(--border); }
        .m-in { width: 100%; padding: 12px; margin: 8px 0; border-radius: 12px; border: 1px solid var(--border); background: #0d1117; color: #fff; box-sizing: border-box; }
        .p-bar { height: 4px; background: #222; border-radius: 10px; margin-top: 10px; display: none; overflow: hidden; }
        .p-fill { height: 100%; background: var(--accent); width: 0%; transition: 0.2s; }
    </style>
</head>
<body>

    <div id="login-screen" style="height:80vh; display:flex; align-items:center; justify-content:center;">
        <div class="card" style="width:320px; text-align:center;">
            <h1>IPA Master</h1>
            <p style="color:var(--gray); font-size:12px">Hệ thống quản lý IPA chuyên nghiệp</p>
            <input type="password" id="admin-pass" class="m-in" placeholder="Nhập mật khẩu Admin" style="text-align:center; margin-top:20px">
            <button class="m-in" style="background:var(--accent); border:none; font-weight:700; cursor:pointer;" onclick="login()">ĐĂNG NHẬP</button>
        </div>
    </div>

    <div id="dashboard" style="display:none;">
        <nav class="navbar"><div class="logo">QUẢN TRỊ TRUNG TÂM</div><button onclick="logout()" style="background:rgba(255,0,0,0.1); border:1px solid rgba(255,0,0,0.2); color:#ff453a; padding:8px 15px; border-radius:12px; cursor:pointer; font-weight:700">Đăng xuất</button></nav>
        <div class="container"><div class="grid" id="account-grid"></div></div>
    </div>

    <div id="edit-modal">
        <div class="modal-c">
            <h3 style="margin-top:0">Chỉnh sửa Ứng dụng</h3>
            <center>
                <img id="e-img" style="width:70px; height:70px; border-radius:15px; border:2px solid var(--border); cursor:pointer;" onclick="document.getElementById('e-file').click()">
                <input type="file" id="e-file" style="display:none" onchange="prevIcon(this)">
                <div style="font-size:10px; color:var(--gray); margin-top:5px">Nhấp vào icon để đổi ảnh</div>
            </center>
            <input type="hidden" id="e-id"><input type="hidden" id="e-idx">
            <label style="font-size:11px">Tên hiển thị:</label><input type="text" id="e-name" class="m-in">
            <label style="font-size:11px">Tên file (.ipa):</label><input type="text" id="e-fname" class="m-in">
            <label style="font-size:11px">Chứng chỉ (Cert):</label><input type="text" id="e-cert" class="m-in">
            <button class="m-in" style="background:var(--accent); border:none; font-weight:700;" onclick="saveE()">Lưu thay đổi</button>
            <button class="m-in" style="background:#333; border:none;" onclick="closeE()">Hủy bỏ</button>
        </div>
    </div>

<script>
    const ACCOUNTS = [
        { name: "Tài khoản 01", api: "https://worker-1.ios-khoindvn.workers.dev" },
        { name: "Tài khoản 02", api: "https://worker-2.ios-khoindvn.workers.dev" }
    ];

    let PASS = localStorage.getItem("ipa_master_pass") || "";
    let ALL_DATA = {}; 

    function login(){ 
        const p = document.getElementById('admin-pass').value;
        localStorage.setItem("ipa_master_pass", p); 
        location.reload(); 
    }
    function logout(){ if(confirm("Bạn muốn đăng xuất?")){ localStorage.removeItem("ipa_master_pass"); location.reload(); } }

    if(PASS) showDashboard();

    function showDashboard(){
        document.getElementById('login-screen').style.display='none';
        document.getElementById('dashboard').style.display='block';
        const grid = document.getElementById('account-grid');
        ACCOUNTS.forEach((acc, idx) => {
            grid.innerHTML += `
                <div class="card">
                    <div class="acc-h">
                        <div style="font-weight:700; color:var(--accent)">${acc.name}</div>
                        <div id="st-txt-${idx}" style="font-size:11px; opacity:0.6">Đang tải...</div>
                    </div>
                    <div class="storage-bar"><div id="st-fill-${idx}" class="storage-fill"></div></div>
                    <div class="tools">
                        <input type="text" class="in-search" placeholder="Tìm tên app..." oninput="filterApps(${idx}, this.value)">
                        <select class="sel-tool" onchange="sortApps(${idx}, this.value)">
                            <option value="newest">Mới nhất</option>
                            <option value="oldest">Cũ nhất</option>
                            <option value="name">Tên A-Z</option>
                            <option value="downloads">Lượt tải</option>
                        </select>
                        <button class="sel-tool" onclick="exportD(${idx})">Xuất Dữ Liệu</button>
                    </div>
                    <div class="dz" id="dz-${idx}" onclick="document.getElementById('f-in-${idx}').click()">
                        <b id="status-${idx}" style="font-size:13px">Kéo thả file hoặc Nhấp để Tải lên</b>
                        <input type="file" id="f-in-${idx}" style="display:none" accept=".ipa" onchange="upFile(this, ${idx})">
                        <div class="p-bar" id="p-box-${idx}"><div class="p-fill" id="p-fill-${idx}"></div></div>
                    </div>
                    <div id="list-${idx}"></div>
                    <div id="more-${idx}" style="text-align:center; padding:10px"></div>
                </div>`;
            loadData(idx);
            setupDD(idx);
        });
    }

    async function loadData(idx, cursor = null){
        const acc = ACCOUNTS[idx];
        try {
            if(!cursor) {
                const s = await(await fetch(`${acc.api}/storage`, {headers:{"Authorization":PASS}})).json();
                const pc = (s.usedBytes / (10*1024*1024*1024)*100);
                document.getElementById(`st-txt-${idx}`).innerText = `Đã dùng: ${pc.toFixed(1)}% / 10GB`;
                document.getElementById(`st-fill-${idx}`).style.width = pc + "%";
            }
            const res = await(await fetch(`${acc.api}/list?cursor=${cursor||""}`, {headers:{"Authorization":PASS}})).json();
            if(!ALL_DATA[idx]) ALL_DATA[idx] = [];
            res.apps.forEach(a => { if(!ALL_DATA[idx].find(x=>x.id===a.id)) ALL_DATA[idx].push(a); });
            renderList(idx);
            const more = document.getElementById(`more-${idx}`);
            if(res.nextCursor) more.innerHTML = `<button class="sel-tool" style="width:100%" onclick="loadData(${idx}, '${res.nextCursor}')">XEM THÊM</button>`;
            else more.innerHTML = "";
        } catch(e) { document.getElementById(`list-${idx}`).innerHTML = "⚠️ Lỗi kết nối tài khoản."; }
    }

    function renderList(idx, f = null) {
        const apps = f || ALL_DATA[idx];
        let h = "";
        apps.forEach(a => {
            h += `
            <div class="app-item">
                <div class="app-top">
                    <img src="${a.icon}" class="app-icon">
                    <div class="app-info">
                        <span class="app-name">${a.name}<span class="badge">📥 ${a.downloads||0}</span></span>
                        <div class="app-sub">${a.version} • ${a.size} • ${a.certName}</div>
                        <div style="font-size:9px; color:#555; margin-top:2px">Exec: ${a.executable} | Build: ${a.build}</div>
                    </div>
                </div>
                <div class="actions">
                    <button class="btn-s" style="background:#007aff" onclick="copyL('${a.isgdLink}')">COPY</button>
                    <button class="btn-s" style="background:#28cd41" onclick="window.open('${a.webLink}')">XEM</button>
                    <button class="btn-s" style="background:#ff9500" onclick="reup(${idx}, '${a.id}')">UPDATE</button>
                    <button class="btn-s" style="background:#58a6ff" onclick='openE(${idx}, ${JSON.stringify(a).replace(/'/g,"&apos;")})'>SỬA</button>
                    <button class="btn-s" style="background:#ff3b30" onclick="del(${idx}, '${a.id}')">XÓA</button>
                </div>
            </div>`;
        });
        document.getElementById(`list-${idx}`).innerHTML = h || "Chưa có ứng dụng nào.";
    }

    function filterApps(idx, q) { renderList(idx, ALL_DATA[idx].filter(a => a.name.toLowerCase().includes(q.toLowerCase()))); }
    function sortApps(idx, t) {
        let d = [...ALL_DATA[idx]];
        if(t==="name") d.sort((a,b)=>a.name.localeCompare(b.name));
        else if(t==="newest") d.sort((a,b)=>b.uploadTs-a.uploadTs);
        else if(t==="oldest") d.sort((a,b)=>a.uploadTs-b.uploadTs);
        else if(t==="downloads") d.sort((a,b)=>(b.downloads||0)-(a.downloads||0));
        renderList(idx, d);
    }
    function exportD(idx) {
        const blob = new Blob([JSON.stringify(ALL_DATA[idx], null, 2)], {type: "application/json"});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `du_lieu_app_${idx}.json`; a.click();
    }

    async function upFile(input, idx, appId=null){
        const file = input.files[0]; if(!file) return;
        const acc = ACCOUNTS[idx];
        const status = document.getElementById(`status-${idx}`);
        const pBox = document.getElementById(`p-box-${idx}`);
        const pFill = document.getElementById(`p-fill-${idx}`);
        pBox.style.display = 'block'; status.innerText = "Đang đọc file IPA...";

        try {
            const info = await (new AppInfoParser(file)).parse();
            const zip = await JSZip.loadAsync(file);
            const prov = Object.keys(zip.files).find(f=>f.endsWith(".app/embedded.mobileprovision"));
            let team = "Enterprise"; 
            if(prov){ 
                const c = await zip.file(prov).async("string");
                team = c.match(/<key>TeamName<\/key>\s*<string>([^<]+)<\/string>/)?.[1] || "Enterprise"; 
            }
            const id = appId || Date.now().toString();
            const start = await(await fetch(`${acc.api}/upload/start`,{method:'POST',headers:{"Authorization":PASS},body:JSON.stringify({fileName:id+".ipa"})})).json();
            const chunkSize = 5 * 1024 * 1024;
            const chunks = Math.ceil(file.size / chunkSize); 
            const parts = [];

            for(let i=0; i<chunks; i++){
                const res = await fetch(`${acc.api}/upload/part?uploadId=${start.uploadId}&partNumber=${i+1}&key=${start.key}`,{
                    method:'POST', headers:{"Authorization":PASS}, body:file.slice(i * chunkSize, (i+1) * chunkSize)
                });
                parts.push({partNumber:i+1, etag:(await res.json()).etag});
                pFill.style.width = Math.round((i+1)/chunks*100) + "%";
                status.innerText = `Đang tải lên: ${Math.round((i+1)/chunks*100)}%`;
            }

            await fetch(`${acc.api}/upload/complete`,{
                method:'POST', headers:{"Authorization":PASS},
                body:JSON.stringify({
                    uploadId:start.uploadId, key:start.key, parts,
                    appData:{
                        id, name:info.CFBundleDisplayName || info.CFBundleName,
                        bundleId:info.CFBundleIdentifier, version:info.CFBundleShortVersionString,
                        build:info.CFBundleVersion, executable:info.CFBundleExecutable,
                        minOs:info.MinimumOSVersion, size:(file.size/1024/1024).toFixed(1)+" MB",
                        icon:info.icon, certName:team, downloads: (appId ? ALL_DATA[idx].find(x=>x.id===appId)?.downloads : 0) || 0
                    }
                })
            });
            pBox.style.display='none'; status.innerText = "Tải lên thành công!";
            setTimeout(() => { status.innerText = "Kéo thả file hoặc Nhấp để Tải lên"; loadData(idx); }, 2000);
        } catch(e) { alert("Lỗi: " + e.message); status.innerText = "Tải lên thất bại!"; pBox.style.display='none'; }
    }

    let NEW_ICON = "";
    function prevIcon(i){ 
        const r=new FileReader(); r.onload=(e)=>{ NEW_ICON=e.target.result; document.getElementById('e-img').src=NEW_ICON; }; r.readAsDataURL(i.files[0]); 
    }
    function openE(idx, a){
        document.getElementById('e-idx').value = idx; document.getElementById('e-id').value = a.id;
        document.getElementById('e-name').value = a.name; document.getElementById('e-fname').value = a.fileName;
        document.getElementById('e-cert').value = a.certName; document.getElementById('e-img').src = a.icon; 
        NEW_ICON = ""; document.getElementById('edit-modal').style.display = 'flex';
    }
    function closeE(){ document.getElementById('edit-modal').style.display = 'none'; }
    async function saveE(){
        const idx = document.getElementById('e-idx').value;
        await fetch(`${ACCOUNTS[idx].api}/upload/edit`, {
            method:'POST', headers:{"Authorization":PASS,"Content-Type":"application/json"}, 
            body:JSON.stringify({ id:document.getElementById('e-id').value, name:document.getElementById('e-name').value, newFileName:document.getElementById('e-fname').value, certName:document.getElementById('e-cert').value, newIcon:NEW_ICON })
        });
        location.reload();
    }
    function setupDD(idx) {
        const dz = document.getElementById(`dz-${idx}`);
        ['dragover', 'dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, (e) => {
            e.preventDefault(); if(evt === 'dragover') dz.style.borderColor = "var(--accent)"; else dz.style.borderColor = "var(--border)";
            if(evt === 'drop' && e.dataTransfer.files.length) { const i = document.getElementById(`f-in-${idx}`); i.files = e.dataTransfer.files; upFile(i, idx); }
        }));
    }
    async function del(idx, id){ if(confirm("Xác nhận xóa?")){ await fetch(`${ACCOUNTS[idx].api}/delete?id=${id}`,{method:'DELETE',headers:{"Authorization":PASS}}); ALL_DATA[idx] = ALL_DATA[idx].filter(a => a.id !== id); renderList(idx); } }
    function reup(idx, id){ const i=document.createElement('input'); i.type='file'; i.accept='.ipa'; i.onchange=(e)=>upFile(i, idx, id); i.click(); }
    function copyL(t){ const el = document.createElement('textarea'); el.value = t; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove(); alert("Đã copy liên kết!"); }
</script>
</body>
</html>
```
