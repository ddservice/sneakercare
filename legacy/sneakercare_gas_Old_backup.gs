// ============================================================
//  Sneaker Care — Google Apps Script (GAS) Backend
//  Spreadsheet ID: Enter your Google Spreadsheet ID below
// ============================================================

var SPREADSHEET_ID = "1MFhGrlOrpguJzrXpzQT4H7T3-Wo4kMAWWisOFpMB_VE"; // REPLACE WITH YOUR SPREADSHEET ID

// ------------------------------------------------------------
// Helper to get active or open Spreadsheet
// ------------------------------------------------------------
function getSS() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "YOUR_SPREADSHEET_ID_HERE" && SPREADSHEET_ID.trim() !== "") {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch(e) {
      Logger.log("Failed to open by ID, falling back to active spreadsheet: " + e.toString());
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

// ------------------------------------------------------------
// Initialize sheets if they do not exist
// ------------------------------------------------------------
function initSheets(ss) {
  var sheets = {
    "SC_Users": ["Username", "PasswordHash", "Fullname", "Nickname", "Role", "Token", "TokenExpiry"],
    "SC_Sales": ["วันที่", "เลขบิล", "ลูกค้า", "Size_S", "Size_M", "Size_L", "Size_XL", "ราคาจริงรวม", "ช่องทางชำระ", "พนักงานผู้ทำ", "ผู้บันทึก", "LastUpdated"],
    "SC_Stock_Transactions": ["วันที่", "ประเภท", "รายการวัสดุ", "จำนวน", "ราคาต่อหน่วย", "ยอดรวม", "ช่องชำระ", "ผู้บันทึก", "LastUpdated"],
    "SC_Stock_Status": ["รายการวัสดุ", "หมวดหมู่", "หน่วย", "คงเหลือ", "ราคาล่าสุด", "จุดสั่งซื้อขั้นต่ำ", "LastUpdated"],
    "SC_Expenses": ["วันที่", "หมวดหมู่", "รายการ", "ยอดรวม", "ช่องทางชำระ", "ผู้บันทึก", "LastUpdated"],
    "SC_Employees": ["ชื่อพนักงาน", "เงินเดือนมูลฐาน", "ตำแหน่ง", "ธนาคาร", "เลขบัญชี", "สถานะ", "LastUpdated"],
    "SC_Opex": ["เดือน", "ประเภทค่าใช้จ่าย", "Key", "รายการ", "ยอด(฿)", "วิธีชำระ", "ผู้บันทึก", "LastUpdated"],
    "SC_Settings": ["SettingKey", "SettingValue", "LastUpdated"]
  };

  for (var name in sheets) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(sheets[name]);
      // If creating users sheet, add a default admin
      if (name === "SC_Users") {
        var defaultAdminPasswordHash = hashPassword("password123");
        sh.appendRow(["admin", defaultAdminPasswordHash, "Administrator", "Admin", "admin", "", ""]);
      }
    }
  }
}

// ------------------------------------------------------------
// SHA-256 Hashing for Passwords
// ------------------------------------------------------------
function hashPassword(password) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  var txtHash = "";
  for (var i = 0; i < rawHash.length; i++) {
    var val = rawHash[i];
    if (val < 0) val += 256;
    var byteString = val.toString(16);
    if (byteString.length == 1) byteString = "0" + byteString;
    txtHash += byteString;
  }
  return txtHash;
}

// ------------------------------------------------------------
// Generate a simple token
// ------------------------------------------------------------
function generateToken() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var token = '';
  for (var i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// ------------------------------------------------------------
// Validate Token & Return User Info
// ------------------------------------------------------------
function validateToken(ss, token) {
  if (!token) return null;
  var sheet = ss.getSheetByName("SC_Users");
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][5] === token) { // Column index 5 (Token)
      var expiryStr = data[i][6]; // Column index 6 (TokenExpiry)
      if (expiryStr) {
        var expiry = new Date(expiryStr);
        if (expiry > new Date()) {
          return {
            username: data[i][0],
            fullname: data[i][2],
            nickname: data[i][3],
            role: data[i][4],
            rowIndex: i + 1
          };
        }
      }
    }
  }
  return null;
}

// ------------------------------------------------------------
// doGet — Read and Return Initial Data
// ------------------------------------------------------------
function doGet(e) {
  try {
    var ss = getSS();
    initSheets(ss);

    var action = e.parameter.action;
    
    // Validate session
    if (action === "validate") {
      var token = e.parameter.token;
      var user = validateToken(ss, token);
      if (user) {
        return ContentService
          .createTextOutput(JSON.stringify({ valid: true, role: user.role, display_name: user.nickname }))
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService
          .createTextOutput(JSON.stringify({ valid: false }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Get sale data for a specific date
    if (action === "getSale") {
      var dateStr = e.parameter.date;
      var token = e.parameter.token;
      var user = validateToken(ss, token);
      if (!user) {
        return ContentService.createTextOutput(JSON.stringify({ code: "unauthorized" })).setMimeType(ContentService.MimeType.JSON);
      }
      var saleSheet = ss.getSheetByName("SC_Sales");
      var saleData = saleSheet.getDataRange().getValues();
      for (var i = 1; i < saleData.length; i++) {
        if (saleData[i][0] === dateStr) {
          return ContentService.createTextOutput(JSON.stringify({
            found: true,
            sales: Number(saleData[i][3]) + Number(saleData[i][4]) + Number(saleData[i][5]) + Number(saleData[i][6]), // Total pairs
            bill_no: saleData[i][1],
            customer: saleData[i][2],
            size_s: Number(saleData[i][3]),
            size_m: Number(saleData[i][4]),
            size_l: Number(saleData[i][5]),
            size_xl: Number(saleData[i][6]),
            total_amount: Number(saleData[i][7]),
            pay_method: saleData[i][8],
            employee: saleData[i][9],
            _income: Number(saleData[i][7])
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ found: false })).setMimeType(ContentService.MimeType.JSON);
    }

    // Default: return master prices and stock status (Requires Authentication)
    var token = e.parameter.token;
    var user = validateToken(ss, token);
    if (!user) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: "error", message: "unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var stockSheet = ss.getSheetByName("SC_Stock_Status");
    var stockData = stockSheet.getDataRange().getValues();
    
    var settingsSheet = ss.getSheetByName("SC_Settings");
    var settingsData = settingsSheet.getDataRange().getValues();
    
    var empSheet = ss.getSheetByName("SC_Employees");
    var empData = empSheet.getDataRange().getValues();

    return ContentService
      .createTextOutput(JSON.stringify({ 
        stock: stockData, 
        settings: settingsData,
        employees: empData
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ------------------------------------------------------------
// doPost — Write Data to Sheets
// ------------------------------------------------------------
function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var ss = getSS();
    initSheets(ss);

    var formType = params.formType;

    // ── 1. LOGIN Flow ────────────────────────────────────────
    if (formType === "login") {
      var username = params.username.toLowerCase();
      var password = params.password;
      var userSheet = ss.getSheetByName("SC_Users");
      var data = userSheet.getDataRange().getValues();
      var hashedPassword = hashPassword(password);

      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toLowerCase() === username && data[i][1] === hashedPassword) {
          var token = generateToken();
          var expiry = new Date();
          expiry.setDate(expiry.getDate() + 7); // Valid for 7 days

          userSheet.getRange(i + 1, 6).setValue(token);
          userSheet.getRange(i + 1, 7).setValue(expiry.toISOString());

          return ContentService.createTextOutput(JSON.stringify({
            status: "ok",
            token: token,
            role: data[i][4],
            display_name: data[i][3],
            full_name: data[i][2],
            username: username
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" })).setMimeType(ContentService.MimeType.JSON);
    }

    // Verify token for all other secure transactions
    var user = validateToken(ss, params.token);
    if (!user) {
      return ContentService.createTextOutput(JSON.stringify({ code: "unauthorized", message: "Session Expired" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 2. LOGOUT ────────────────────────────────────────────
    if (formType === "logout") {
      var userSheet = ss.getSheetByName("SC_Users");
      userSheet.getRange(user.rowIndex, 6).setValue("");
      userSheet.getRange(user.rowIndex, 7).setValue("");
      return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 3. CHANGE PASSWORD ───────────────────────────────────
    if (formType === "change_password") {
      var userSheet = ss.getSheetByName("SC_Users");
      var newHash = hashPassword(params.new_password);
      
      // Admin can change anyone's, other users can only change their own
      if (user.role === "admin" || user.username === params.target_user) {
        var data = userSheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          if (data[i][0] === params.target_user) {
            userSheet.getRange(i + 1, 2).setValue(newHash);
            // Expire sessions
            userSheet.getRange(i + 1, 6).setValue("");
            userSheet.getRange(i + 1, 7).setValue("");
            return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "ไม่มีสิทธิ์ในการเปลี่ยนรหัสผ่าน" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 4. RECORD DAILY SALES (SC_Sales) ─────────────────────
    if (formType === "sales_form" || formType === "update_sales_form") {
      var sheet = ss.getSheetByName("SC_Sales");
      var dateStr = params.date;
      var foundRowIndex = -1;

      // Check if row already exists for this date
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === dateStr) {
          foundRowIndex = i + 1;
          break;
        }
      }

      var rowData = [
        dateStr,
        params.bill_no || "",
        params.customer || "",
        Number(params.size_s || 0),
        Number(params.size_m || 0),
        Number(params.size_l || 0),
        Number(params.size_xl || 0),
        Number(params.total_amount || 0),
        params.pay_method || "เงินสด",
        params.employee || "",
        params.logged_by || user.nickname,
        new Date().toISOString()
      ];

      if (foundRowIndex > 0) {
        if (formType === "update_sales_form" || params.overwrite) {
          sheet.getRange(foundRowIndex, 1, 1, rowData.length).setValues([rowData]);
        } else {
          return ContentService.createTextOutput(JSON.stringify({ status: "duplicate" })).setMimeType(ContentService.MimeType.JSON);
        }
      } else {
        sheet.appendRow(rowData);
      }

      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 5. RECORD operational EXPENSE (SC_Expenses) ──────────
    if (formType === "expense_form") {
      var sheet = ss.getSheetByName("SC_Expenses");
      sheet.appendRow([
        params.date,
        params.category,
        params.item_name,
        Number(params.total_amount),
        params.pay_method,
        params.logged_by || user.nickname,
        new Date().toISOString()
      ]);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 6. RECORD STOCK TRANSACTION (SC_Stock_Transactions) ──
    if (formType === "stock_transaction_form") {
      var sheet = ss.getSheetByName("SC_Stock_Transactions");
      var dateStr = params.date;
      var typeStr = params.type; // "ซื้อเข้า" or "ใช้งาน"
      var itemName = params.item_name;
      var qty = Number(params.qty || 0);
      var pricePerUnit = Number(params.price_per_unit || 0);
      var totalAmt = Number(params.total_amount || 0);
      var payMethod = params.pay_method || "";

      sheet.appendRow([
        dateStr,
        typeStr,
        itemName,
        qty,
        pricePerUnit,
        totalAmt,
        payMethod,
        params.logged_by || user.nickname,
        new Date().toISOString()
      ]);

      // Update current balance in Master Stock Status
      var qtyChange = (typeStr === "ซื้อเข้า") ? qty : -qty;
      updateStockBalance(ss, itemName, qtyChange, pricePerUnit, params.category, params.unit, dateStr);

      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 7. SAVE FIXED OPEX (SC_Opex) ─────────────────────────
    if (formType === "save_opex") {
      var sheet = ss.getSheetByName("SC_Opex");
      var month = params.month; // "MM/YYYY"
      
      // Clean existing month records first
      var data = sheet.getDataRange().getValues();
      for (var i = data.length - 1; i >= 1; i--) {
        if (data[i][0] === month) {
          sheet.deleteRow(i + 1);
        }
      }

      // Append new opex rows
      var items = params.items || [];
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        sheet.appendRow([
          month,
          it.category, // "ค่าดำเนินการ", "ค่าแรงพนักงาน", "ภาษี"
          it.key,
          it.name,
          Number(it.amount),
          it.method,
          params.logged_by || user.nickname,
          new Date().toISOString()
        ]);
      }

      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 8. SAVE BUSINESS INFO ────────────────────────────────
    if (formType === "save_biz_info") {
      var sheet = ss.getSheetByName("SC_Settings");
      var settings = params.settings || {};
      
      for (var key in settings) {
        var val = settings[key];
        var found = false;
        var data = sheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          if (data[i][0] === key) {
            sheet.getRange(i + 1, 2).setValue(val);
            sheet.getRange(i + 1, 3).setValue(new Date().toISOString());
            found = true;
            break;
          }
        }
        if (!found) {
          sheet.appendRow([key, val, new Date().toISOString()]);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 9. SAVE EMPLOYEE CONFIG ──────────────────────────────
    if (formType === "save_emp_config") {
      var sheet = ss.getSheetByName("SC_Employees");
      sheet.clearContents();
      sheet.appendRow(["ชื่อพนักงาน", "เงินเดือนมูลฐาน", "ตำแหน่ง", "ธนาคาร", "เลขบัญชี", "สถานะ", "LastUpdated"]);
      
      var emps = params.employees || [];
      for (var j = 0; j < emps.length; j++) {
        sheet.appendRow([
          emps[j].name,
          Number(emps[j].salary || 0),
          emps[j].position || "",
          emps[j].bank || "",
          emps[j].account_no || "",
          emps[j].status || "Active",
          new Date().toISOString()
        ]);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 10. EXPORT DATABASES ─────────────────────────────────
    if (formType === "export") {
      var response = {};
      var sheetsToExport = ["SC_Sales", "SC_Stock_Transactions", "SC_Stock_Status", "SC_Expenses", "SC_Employees", "SC_Opex"];
      for (var sIdx = 0; sIdx < sheetsToExport.length; sIdx++) {
        var sName = sheetsToExport[sIdx];
        var s = ss.getSheetByName(sName);
        if (s) {
          response[sName] = s.getDataRange().getValues();
        } else {
          response[sName] = [];
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success", data: response })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 11. FETCH MONTHLY DATA (For dashboard load) ──────────
    if (formType === "list_monthly") {
      var months = params.months || []; // list of "MM/YYYY" or "YYYY-MM"
      var sales = [];
      var expenses = [];
      var opex = [];

      var saleSheet = ss.getSheetByName("SC_Sales");
      var expSheet = ss.getSheetByName("SC_Expenses");
      var opSheet = ss.getSheetByName("SC_Opex");
      var stockTransSheet = ss.getSheetByName("SC_Stock_Transactions");

      var sData = saleSheet ? saleSheet.getDataRange().getValues() : [];
      var eData = expSheet ? expSheet.getDataRange().getValues() : [];
      var oData = opSheet ? opSheet.getDataRange().getValues() : [];
      var stData = stockTransSheet ? stockTransSheet.getDataRange().getValues() : [];

      // Check if dates match months filter (date formatted as DD/MM/YYYY)
      for (var a = 1; a < sData.length; a++) {
        var dateParts = sData[a][0].split('/');
        if (dateParts.length === 3) {
          var rowMonth = dateParts[1] + '/' + dateParts[2];
          if (months.indexOf(rowMonth) >= 0) {
            sales.push(sData[a]);
          }
        }
      }

      for (var b = 1; b < eData.length; b++) {
        var dateParts = eData[b][0].split('/');
        if (dateParts.length === 3) {
          var rowMonth = dateParts[1] + '/' + dateParts[2];
          if (months.indexOf(rowMonth) >= 0) {
            expenses.push(eData[b]);
          }
        }
      }

      // Add Stock Buy-ins to expenses (since buying stock is an opex cash outflow)
      for (var c = 1; c < stData.length; c++) {
        if (stData[c][1] === "ซื้อเข้า") {
          var dateParts = stData[c][0].split('/');
          if (dateParts.length === 3) {
            var rowMonth = dateParts[1] + '/' + dateParts[2];
            if (months.indexOf(rowMonth) >= 0) {
              expenses.push([
                stData[c][0], // Date
                "ต้นทุนวัสดุคลัง", // Category
                stData[c][2], // ItemName
                stData[c][5], // Total amount
                stData[c][6], // Payment method
                stData[c][7], // LoggedBy
                stData[c][8]  // LastUpdated
              ]);
            }
          }
        }
      }

      for (var d = 1; d < oData.length; d++) {
        var rowMonth = oData[d][0];
        if (months.indexOf(rowMonth) >= 0) {
          opex.push(oData[d]);
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        sales: sales,
        expenses: expenses,
        opex: opex
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 12. DATA PURGE MONTH (SC_Sales, SC_Expenses, SC_Opex, SC_Stock_Transactions) ──
    if (formType === "delete_month") {
      if (user.role !== "admin" && user.role !== "co-admin") {
        return ContentService.createTextOutput(JSON.stringify({ code: "forbidden" })).setMimeType(ContentService.MimeType.JSON);
      }
      var targetMonth = params.month; // "MM/YYYY"
      var category = params.category; // "all", "sales", "expense", "opex", "stock"

      var sheetsToDelete = [];
      if (category === "all" || category === "sales") sheetsToDelete.push("SC_Sales");
      if (category === "all" || category === "expense") sheetsToDelete.push("SC_Expenses");
      if (category === "all" || category === "opex") sheetsToDelete.push("SC_Opex");
      if (category === "all" || category === "stock") sheetsToDelete.push("SC_Stock_Transactions");

      for (var s = 0; s < sheetsToDelete.length; s++) {
        var sheetName = sheetsToDelete[s];
        var sh = ss.getSheetByName(sheetName);
        if (!sh) continue;
        var data = sh.getDataRange().getValues();
        for (var row = data.length - 1; row >= 1; row--) {
          var dateVal = data[row][0]; // "DD/MM/YYYY" or "MM/YYYY"
          var match = false;
          if (sheetName === "SC_Opex") {
            match = (dateVal === targetMonth);
          } else {
            var parts = dateVal.split('/');
            if (parts.length === 3) {
              match = (parts[1] + '/' + parts[2] === targetMonth);
            }
          }
          if (match) {
            // If deleting stock transactions, recalculate master balance
            if (sheetName === "SC_Stock_Transactions") {
              var typeStr = data[row][1];
              var itemName = data[row][2];
              var qty = Number(data[row][3] || 0);
              var undoQtyChange = (typeStr === "ซื้อเข้า") ? -qty : qty;
              updateStockBalance(ss, itemName, undoQtyChange, 0, "", "", new Date().toISOString());
            }
            sh.deleteRow(row + 1);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 13. USER MANAGEMENT (Admin only) ──────────────────────
    if (user.role !== "admin") {
      return ContentService.createTextOutput(JSON.stringify({ code: "forbidden" })).setMimeType(ContentService.MimeType.JSON);
    }

    var userSheet = ss.getSheetByName("SC_Users");

    if (formType === "list_users") {
      var data = userSheet.getDataRange().getValues();
      var users = [];
      for (var i = 1; i < data.length; i++) {
        users.push({
          username: data[i][0],
          fullname: data[i][2],
          nickname: data[i][3],
          role: data[i][4],
          has_token: (data[i][5] !== "")
        });
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "ok", users: users })).setMimeType(ContentService.MimeType.JSON);
    }

    if (formType === "create_user") {
      var newUsername = params.username.toLowerCase();
      var data = userSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toLowerCase() === newUsername) {
          return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "ชื่อผู้ใช้นี้มีอยู่แล้ว" })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      var newHash = hashPassword(params.password);
      userSheet.appendRow([newUsername, newHash, params.full_name, params.nickname, params.role, "", ""]);
      return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (formType === "update_user") {
      var targetUser = params.username.toLowerCase();
      var data = userSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toLowerCase() === targetUser) {
          userSheet.getRange(i + 1, 3).setValue(params.full_name);
          userSheet.getRange(i + 1, 4).setValue(params.nickname);
          userSheet.getRange(i + 1, 5).setValue(params.role);
          // If role changed, expire session
          userSheet.getRange(i + 1, 6).setValue("");
          userSheet.getRange(i + 1, 7).setValue("");
          return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "ไม่พบผู้ใช้ที่ต้องการแก้ไข" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (formType === "delete_user") {
      var targetUser = params.username.toLowerCase();
      if (targetUser === user.username.toLowerCase()) {
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "ไม่สามารถลบบัญชีของตัวเองได้" })).setMimeType(ContentService.MimeType.JSON);
      }
      var data = userSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toLowerCase() === targetUser) {
          userSheet.deleteRow(i + 1);
          return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "ไม่พบผู้ใช้ที่ต้องการลบ" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (formType === "reset_user_password") {
      var targetUser = params.username.toLowerCase();
      var newHash = hashPassword(params.new_password);
      var data = userSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toLowerCase() === targetUser) {
          userSheet.getRange(i + 1, 2).setValue(newHash);
          userSheet.getRange(i + 1, 6).setValue("");
          userSheet.getRange(i + 1, 7).setValue("");
          return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "ไม่พบผู้ใช้" })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "ไม่พบฟังก์ชันที่เรียก" })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ------------------------------------------------------------
// Update Master Stock Balance Helper
// ------------------------------------------------------------
function updateStockBalance(ss, itemName, qtyChange, pricePerUnit, category, unit, dateStr) {
  var sheet = ss.getSheetByName("SC_Stock_Status");
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var found = false;
  var colIndexQty = 3; // Column D (คงเหลือ)
  var colIndexPrice = 4; // Column E (ราคาล่าสุด)
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === itemName) {
      var oldQty = Number(data[i][3] || 0);
      var newQty = Math.max(0, oldQty + qtyChange);
      
      sheet.getRange(i + 1, colIndexQty + 1).setValue(newQty);
      if (pricePerUnit > 0) {
        sheet.getRange(i + 1, colIndexPrice + 1).setValue(pricePerUnit);
      }
      sheet.getRange(i + 1, 7).setValue(new Date().toISOString()); // LastUpdated
      found = true;
      break;
    }
  }

  if (!found) {
    // Append a new item to stock status master
    sheet.appendRow([
      itemName,
      category || "ทั่วไป",
      unit || "ชิ้น",
      Math.max(0, qtyChange),
      pricePerUnit,
      10, // Default min threshold alert
      new Date().toISOString()
    ]);
  }
}
