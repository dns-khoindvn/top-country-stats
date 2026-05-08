# 🍎 IPA Master V46 - Apple Font & Cài đặt

![Version](https://img.shields.io/badge/Phiên_Bản-46.0-blue.svg)
![Button](https://img.shields.io/badge/Nút-Cài_Đặt-green.svg)

---

## 🔧 Mã nguồn Backend — `worker.js` (Nút Cài đặt)

```javascript
// ... (Các phần khác giữ nguyên) ...

function generateLuxuryView(app, host) {
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${app.name}</title>
    <style>
      :root{--blue:#007aff;--bg:#000;--card:rgba(255,255,255,0.08)}
      body{
        background:var(--bg); color:#fff; 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        margin:0; padding:0; min-height:100vh;
      }
      .blur-bg{position:fixed;top:-50px;left:-50px;width:120%;height:120%;background:url('${app.icon}') center/cover;filter:blur(80px) brightness(0.4);z-index:-1}
      .app-wrapper{max-width:500px;margin:0 auto;padding:20px;animation:fUp 0.8s ease}
      @keyframes fUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
      
      .header-info{display:flex;gap:20px;align-items:center;margin-top:40px;margin-bottom:30px}
      .main-icon{width:110px;height:110px;border-radius:24px;box-shadow:0 15px 30px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1)}
      .title-box h1{margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px}
      .dev-name{color:var(--blue);font-weight:500;font-size:14px;margin:4px 0}
      .cert-tag{background:rgba(255,255,255,0.1);padding:4px 10px;border-radius:8px;font-size:10px;font-weight:700;display:inline-block;margin-top:8px;color:#aaa}

      /* NÚT CÀI ĐẶT */
      .btn-install{background:var(--blue);color:#fff;text-decoration:none;display:block;text-align:center;padding:16px;border-radius:20px;font-weight:700;font-size:16px;margin:25px 0;transition:0.2s}
      .btn-install:active{transform:scale(0.96);opacity:0.8}
      
      .btn-ipa{background:rgba(255,255,255,0.1);color:#fff;text-decoration:none;display:block;text-align:center;padding:12px;border-radius:15px;font-size:13px;font-weight:600}
      .metrics{display:flex;justify-content:space-between;background:var(--card);padding:20px;border-radius:25px;margin:20px 0}
      .m-item{text-align:center;flex:1}.m-label{font-size:10px;color:#888;font-weight:700;margin-bottom:5px;display:block}.m-val{font-size:15px;font-weight:700}
      .section-title{font-size:19px;font-weight:700;margin:30px 0 15px}
      .whats-new{background:var(--card);padding:20px;border-radius:25px;font-size:14px;line-height:1.6;color:#ddd}
      .info-row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:14px}
      .footer-guide{margin-top:40px;text-align:center;font-size:12px;color:#666;padding:20px}
    </style>
    </head><body>
      <div class="blur-bg"></div>
      <div class="app-wrapper">
        <div class="header-info">
          <img src="${app.icon}" class="main-icon">
          <div class="title-box">
            <h1>${app.name}</h1>
            <div class="dev-name">${app.certName}</div>
            <div class="cert-tag">APPLE NATIVE STYLE</div>
          </div>
        </div>
        <div class="metrics">
          <div class="m-item"><span class="m-label">ĐÁNH GIÁ</span><span class="m-val">4.9 ★</span></div>
          <div class="m-item" style="border-left:1px solid rgba(255,255,255,0.1); border-right:1px solid rgba(255,255,255,0.1)"><span class="m-label">PHIÊN BẢN</span><span class="m-val">${app.version}</span></div>
          <div class="m-item"><span class="m-label">LƯỢT TẢI</span><span class="m-val">${app.downloads||0}+</span></div>
        </div>
        
        <a href="${host}/i/${app.id}" class="btn-install">CÀI ĐẶT</a>
        
        <a href="${app.ipaLink}" class="btn-ipa">Tải IPA (${app.size})</a>
        <div class="section-title">Có gì mới</div>
        <div class="whats-new">Cải tiến hiệu suất và sửa lỗi.</div>
        <div class="section-title">Thông tin</div>
        <div class="info-list">
          <div class="info-row"><span>Nhà cung cấp</span><b>${app.certName}</b></div>
          <div class="info-row"><span>Dung lượng</span><b>${app.size}</b></div>
          <div class="info-row"><span>Tương thích</span><b>iOS ${app.minOs}+</b></div>
          <div class="info-row" style="border:none"><span>Ngày phát hành</span><b>${app.releaseDate}</b></div>
        </div>
        <div class="footer-guide">Sử dụng Safari. Tin cậy chứng chỉ trong Cài đặt hệ thống.</div>
      </div>
    </body></html>`;
}
```
