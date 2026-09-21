/* ============================================================
   01-i18n.js — Localization system (EN / VI), no page reload.
   Usage: Game.i18n.t('key', {param: value}) -> string
          Game.i18n.setLang('vi') -> re-renders all [data-i18n] nodes
   ============================================================ */
(function (G) {
  "use strict";

  const STRINGS = {
    en: {
      "app.title": "Money Factory Tycoon",
      "hud.money": "Cash",
      "hud.perSec": "/sec",
      "hud.research": "Research",
      "hud.power": "Power",
      "hud.prestigeAvailable": "Rebirth Ready!",
      "hud.zone": "Zone",
      "hud.floor": "Floor",

      "menu.factory": "Factory",
      "menu.rooms": "Rooms",
      "menu.prestige": "Rebirth",
      "menu.tech": "Tech Tree",
      "menu.settings": "Settings",
      "menu.close": "Close",

      "zone.downtown.name": "Downtown Warehouse",
      "zone.industrial.name": "Industrial Park",
      "zone.corporate.name": "Corporate Tower",
      "floor.1": "Floor 1",
      "floor.2": "Floor 2",
      "floor.locked": "Locked",
      "floor.unlockFor": "Unlock for {amount}",
      "zone.unlockFor": "Unlock zone for {amount}",
      "zone.unlockPrestige": "Requires {amount} rebirth(s)",

      "machine.common.name": "Inkjet Press",
      "machine.common.desc": "A humble desktop printer that somehow prints cash.",
      "machine.uncommon.name": "Offset Press",
      "machine.uncommon.desc": "Industrial-grade roller press. Smells like fresh ink.",
      "machine.epic.name": "Digital Press",
      "machine.epic.desc": "Laser-precise plates etch bills at high speed.",
      "machine.legendary.name": "Quantum Printer",
      "machine.legendary.desc": "Prints money in superposition — spent and unspent at once.",
      "machine.mythic.name": "Singularity Mint",
      "machine.mythic.desc": "A pocket dimension that folds paper into fortunes.",

      "tier.common": "Common",
      "tier.uncommon": "Uncommon",
      "tier.epic": "Epic",
      "tier.legendary": "Legendary",
      "tier.mythic": "Mythic",

      "action.buy": "Buy",
      "action.buyMachine": "Place {tier}",
      "action.upgrade": "Upgrade",
      "action.collect": "Collect",
      "action.max": "MAX",
      "action.locked": "Locked",
      "action.select": "Select",
      "action.selected": "Selected",
      "action.rebirth": "Rebirth Now",
      "action.confirm": "Confirm",
      "action.cancel": "Cancel",

      "upgrade.speed": "Speed",
      "upgrade.output": "Output",
      "upgrade.ink": "Ink Quality",

      "floorsys.conveyor": "Conveyor Belts",
      "floorsys.collector": "Auto-Collectors",
      "floorsys.conveyor.desc": "Boosts all machine output on this floor.",
      "floorsys.collector.desc": "Automatically collects finished cash nearby.",

      "room.rnd.name": "R&D Lab",
      "room.rnd.desc": "Generates Research Points over time, spent on Tech Tree purchases.",
      "room.vault.name": "Cash Vault",
      "room.vault.desc": "Increases offline earning cap and passive interest.",
      "room.power.name": "Power Plant",
      "room.power.desc": "Generates Power required to run automation.",
      "room.level": "Level {level}",

      "prestige.title": "Factory Rebirth",
      "prestige.desc": "Reset your factory for permanent Perk Points and a lasting production bonus. Zones, machines and room levels reset — Perk Points and Tech Tree stay forever.",
      "prestige.locked": "Reach {amount} cash at once to unlock rebirth.",
      "prestige.gain": "You will gain {amount} Perk Points",
      "prestige.current": "Rebirths: {count} | Perk Points: {points}",
      "prestige.confirmTitle": "Rebirth the factory?",
      "prestige.confirmBody": "This resets your money, machines and room levels. You keep Perk Points and all Tech Tree upgrades. This cannot be undone.",

      "tech.title": "Tech Tree",
      "tech.points": "Perk Points: {points} · Research: {research}",
      "tech.branch.production": "Production",
      "tech.branch.automation": "Automation",
      "tech.branch.economy": "Economy",
      "tech.prod1.name": "Efficient Presses",
      "tech.prod2.name": "Precision Ink",
      "tech.prod3.name": "Lucky Streaks",
      "tech.prod4.name": "Mass Production",
      "tech.prod5.name": "Overclocked Motors",
      "tech.auto1.name": "Energy Efficiency",
      "tech.auto2.name": "Swift Collectors",
      "tech.auto4.name": "Lab Grants",
      "tech.auto5.name": "Smart Grid",
      "tech.econ1.name": "Bulk Discounts",
      "tech.econ2.name": "Bigger Vault",
      "tech.econ3.name": "Supplier Deals",
      "tech.econ4.name": "Seed Capital",
      "tech.econ5.name": "Legacy Fund",

      "settings.title": "Settings",
      "settings.language": "Language",
      "settings.music": "Music",
      "settings.sfx": "Sound Effects",
      "settings.hardReset": "Erase Save & Restart",
      "settings.hardResetConfirm": "This permanently deletes ALL progress. Are you sure?",
      "settings.export": "Export Save",
      "settings.import": "Import Save",

      "offline.title": "Welcome back!",
      "offline.body": "You were away for {time}.",
      "offline.earned": "Your factory produced {amount} while you were gone.",
      "offline.capped": "(capped by your Cash Vault level)",
      "offline.claim": "Claim & Continue",

      "notify.machinePlaced": "{tier} printer placed!",
      "notify.upgradeBought": "{upgrade} upgraded to level {level}!",
      "notify.zoneUnlocked": "{zone} unlocked!",
      "notify.floorUnlocked": "{floor} unlocked!",
      "notify.prestige": "Factory reborn! +{points} Perk Points",
      "notify.techUnlocked": "{tech} researched!",
      "notify.notEnoughMoney": "Not enough cash!",
      "notify.notEnoughPoints": "Not enough Perk Points!",
      "notify.notEnoughResearch": "Not enough Research Points!",
      "notify.notEnoughPower": "Not enough Power! Upgrade your Power Plant.",
      "notify.saved": "Game saved",
      "notify.saveExported": "Save code copied to the clipboard.",
      "notify.importFailed": "Invalid save code.",
      "notify.slotEmpty": "Empty slot — buy a printer here.",

      "controls.title": "Controls",
      "controls.pc": "WASD/Arrows: pan camera · Space: collect nearest · Scroll: zoom · Drag: pan · 1-5: select machine tier",
      "controls.mobile": "Touch/drag: pan camera · Tap machine: collect · Buttons: menus",

      "tooltip.locked": "Unlock the previous tier or floor first.",
      "common.perSecShort": "/s",
      "common.perHour": "/hr",
      "orientation.rotate": "Please rotate your device to landscape",
    },

    vi: {
      "app.title": "Đại Công Xưởng Tiền",
      "hud.money": "Tiền",
      "hud.perSec": "/giây",
      "hud.research": "Nghiên cứu",
      "hud.power": "Điện",
      "hud.prestigeAvailable": "Sẵn Sàng Tái Sinh!",
      "hud.zone": "Khu",
      "hud.floor": "Tầng",

      "menu.factory": "Nhà Máy",
      "menu.rooms": "Phòng Chức Năng",
      "menu.prestige": "Tái Sinh",
      "menu.tech": "Cây Công Nghệ",
      "menu.settings": "Cài Đặt",
      "menu.close": "Đóng",

      "zone.downtown.name": "Kho Trung Tâm",
      "zone.industrial.name": "Khu Công Nghiệp",
      "zone.corporate.name": "Tòa Tháp Tập Đoàn",
      "floor.1": "Tầng 1",
      "floor.2": "Tầng 2",
      "floor.locked": "Đã khóa",
      "floor.unlockFor": "Mở khóa với {amount}",
      "zone.unlockFor": "Mở khóa khu với {amount}",
      "zone.unlockPrestige": "Cần {amount} lần tái sinh",

      "machine.common.name": "Máy In Phun",
      "machine.common.desc": "Một chiếc máy in bàn khiêm tốn nhưng lại in ra tiền.",
      "machine.uncommon.name": "Máy In Offset",
      "machine.uncommon.desc": "Máy ép cuộn công nghiệp. Thoang thoảng mùi mực mới.",
      "machine.epic.name": "Máy In Kỹ Thuật Số",
      "machine.epic.desc": "Bản khắc laser chính xác, in tiền với tốc độ cao.",
      "machine.legendary.name": "Máy In Lượng Tử",
      "machine.legendary.desc": "In tiền ở trạng thái chồng chập — vừa tiêu vừa chưa tiêu.",
      "machine.mythic.name": "Xưởng Đúc Kỳ Dị",
      "machine.mythic.desc": "Một chiều không gian túi gấp giấy thành vận may.",

      "tier.common": "Phổ Thông",
      "tier.uncommon": "Không Phổ Biến",
      "tier.epic": "Sử Thi",
      "tier.legendary": "Huyền Thoại",
      "tier.mythic": "Thần Thoại",

      "action.buy": "Mua",
      "action.buyMachine": "Đặt {tier}",
      "action.upgrade": "Nâng Cấp",
      "action.collect": "Thu Tiền",
      "action.max": "TỐI ĐA",
      "action.locked": "Đã Khóa",
      "action.select": "Chọn",
      "action.selected": "Đã Chọn",
      "action.rebirth": "Tái Sinh Ngay",
      "action.confirm": "Xác Nhận",
      "action.cancel": "Hủy",

      "upgrade.speed": "Tốc Độ",
      "upgrade.output": "Sản Lượng",
      "upgrade.ink": "Chất Lượng Mực",

      "floorsys.conveyor": "Băng Chuyền",
      "floorsys.collector": "Máy Thu Tự Động",
      "floorsys.conveyor.desc": "Tăng sản lượng của tất cả máy trên tầng này.",
      "floorsys.collector.desc": "Tự động thu tiền đã hoàn thành gần đó.",

      "room.rnd.name": "Phòng R&D",
      "room.rnd.desc": "Tạo Điểm Nghiên Cứu theo thời gian, dùng để mua Cây Công Nghệ.",
      "room.vault.name": "Hầm Tiền",
      "room.vault.desc": "Tăng giới hạn thu nhập offline và lãi suất thụ động.",
      "room.power.name": "Nhà Máy Điện",
      "room.power.desc": "Tạo ra Điện cần thiết để vận hành tự động hóa.",
      "room.level": "Cấp {level}",

      "prestige.title": "Tái Sinh Nhà Máy",
      "prestige.desc": "Đặt lại nhà máy để nhận Điểm Kỹ Năng vĩnh viễn và tiền thưởng sản xuất lâu dài. Khu, máy và cấp phòng sẽ đặt lại — Điểm Kỹ Năng và Cây Công Nghệ được giữ mãi mãi.",
      "prestige.locked": "Cần đạt {amount} tiền cùng lúc để mở khóa tái sinh.",
      "prestige.gain": "Bạn sẽ nhận được {amount} Điểm Kỹ Năng",
      "prestige.current": "Số lần tái sinh: {count} | Điểm Kỹ Năng: {points}",
      "prestige.confirmTitle": "Tái sinh nhà máy?",
      "prestige.confirmBody": "Thao tác này đặt lại tiền, máy và cấp phòng của bạn. Bạn giữ lại Điểm Kỹ Năng và mọi nâng cấp Cây Công Nghệ. Không thể hoàn tác.",

      "tech.title": "Cây Công Nghệ",
      "tech.points": "Điểm Kỹ Năng: {points} · Nghiên Cứu: {research}",
      "tech.branch.production": "Sản Xuất",
      "tech.branch.automation": "Tự Động Hóa",
      "tech.branch.economy": "Kinh Tế",
      "tech.prod1.name": "Máy Ép Hiệu Quả",
      "tech.prod2.name": "Mực In Chính Xác",
      "tech.prod3.name": "Chuỗi May Mắn",
      "tech.prod4.name": "Sản Xuất Hàng Loạt",
      "tech.prod5.name": "Động Cơ Ép Xung",
      "tech.auto1.name": "Hiệu Suất Năng Lượng",
      "tech.auto2.name": "Máy Thu Nhanh",
      "tech.auto4.name": "Tài Trợ Phòng Lab",
      "tech.auto5.name": "Lưới Điện Thông Minh",
      "tech.econ1.name": "Giảm Giá Sỉ",
      "tech.econ2.name": "Hầm Lớn Hơn",
      "tech.econ3.name": "Thỏa Thuận Nhà Cung Cấp",
      "tech.econ4.name": "Vốn Khởi Điểm",
      "tech.econ5.name": "Quỹ Di Sản",

      "settings.title": "Cài Đặt",
      "settings.language": "Ngôn Ngữ",
      "settings.music": "Nhạc Nền",
      "settings.sfx": "Hiệu Ứng Âm Thanh",
      "settings.hardReset": "Xóa Dữ Liệu & Bắt Đầu Lại",
      "settings.hardResetConfirm": "Thao tác này sẽ xóa VĨNH VIỄN toàn bộ tiến trình. Bạn có chắc không?",
      "settings.export": "Xuất File Lưu",
      "settings.import": "Nhập File Lưu",

      "offline.title": "Chào mừng trở lại!",
      "offline.body": "Bạn đã vắng mặt {time}.",
      "offline.earned": "Nhà máy của bạn đã sản xuất {amount} trong lúc bạn vắng mặt.",
      "offline.capped": "(giới hạn bởi cấp độ Hầm Tiền của bạn)",
      "offline.claim": "Nhận & Tiếp Tục",

      "notify.machinePlaced": "Đã đặt máy in {tier}!",
      "notify.upgradeBought": "{upgrade} đã nâng lên cấp {level}!",
      "notify.zoneUnlocked": "Đã mở khóa {zone}!",
      "notify.floorUnlocked": "Đã mở khóa {floor}!",
      "notify.prestige": "Nhà máy đã tái sinh! +{points} Điểm Kỹ Năng",
      "notify.techUnlocked": "Đã nghiên cứu {tech}!",
      "notify.notEnoughMoney": "Không đủ tiền!",
      "notify.notEnoughPoints": "Không đủ Điểm Kỹ Năng!",
      "notify.notEnoughResearch": "Không đủ Điểm Nghiên Cứu!",
      "notify.notEnoughPower": "Không đủ Điện! Hãy nâng cấp Nhà Máy Điện.",
      "notify.saved": "Đã lưu trò chơi",
      "notify.saveExported": "Đã sao chép mã lưu vào bộ nhớ tạm.",
      "notify.importFailed": "Mã lưu không hợp lệ.",
      "notify.slotEmpty": "Ô trống — hãy mua máy in tại đây.",

      "controls.title": "Điều Khiển",
      "controls.pc": "WASD/Mũi tên: di chuyển camera · Space: thu tiền gần nhất · Cuộn: thu phóng · Kéo: di chuyển · 1-5: chọn bậc máy",
      "controls.mobile": "Chạm/kéo: di chuyển camera · Chạm máy: thu tiền · Nút: menu",

      "tooltip.locked": "Hãy mở khóa bậc hoặc tầng trước đó.",
      "common.perSecShort": "/g",
      "common.perHour": "/giờ",
      "orientation.rotate": "Vui lòng xoay thiết bị sang chế độ ngang",
    },
  };

  let currentLang = "en";
  const listeners = [];

  function t(key, params) {
    const dict = STRINGS[currentLang] || STRINGS.en;
    let str = dict[key];
    if (str === undefined) str = STRINGS.en[key];
    if (str === undefined) return key;
    if (params) {
      Object.keys(params).forEach((p) => {
        str = str.replace(new RegExp("\\{" + p + "\\}", "g"), params[p]);
      });
    }
    return str;
  }

  function setLang(lang) {
    if (!STRINGS[lang]) return;
    currentLang = lang;
    applyToDom();
    listeners.forEach((fn) => {
      try { fn(lang); } catch (e) { console.error(e); }
    });
  }

  function getLang() { return currentLang; }

  function onChange(fn) { listeners.push(fn); }

  function applyToDom() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      // format: data-i18n-attr="placeholder:some.key|title:other.key"
      const spec = el.getAttribute("data-i18n-attr");
      spec.split("|").forEach((pair) => {
        const [attr, key] = pair.split(":");
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
    document.documentElement.setAttribute("lang", currentLang);
  }

  G.i18n = { t, setLang, getLang, onChange, applyToDom, STRINGS };
})(window.Game = window.Game || {});
