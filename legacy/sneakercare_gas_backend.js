// ============================================================
//  Sneaker Care — Google Apps Script (GAS) Backend  [Updated]
//  แก้ไข: SC_Sales schema, getSale fields, entered_by, discount/gross_amount
// ============================================================

var SPREADSHEET_ID = "1MFhGrlOrpguJzrXpzQT4H7T3-Wo4kMAWWisOFpMB_VE";

function getSS() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "YOUR_SPREADSHEET_ID_HERE" && SPREADSHEET_ID.trim() !== "") {
    try { return SpreadsheetApp.openById(SPREADSHEET_ID); } catch(e) {}
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

// ── SC_Sales คอลัมน์ (16 คอล) ────────────────────────────────
// [0]วันที่  [1]เลขบิล/บริการพิเศษ  [2]ลูกค้า  [3]S  [4]M  [5]L  [6]XL
// [7]ยอดสุทธิ  [8]ยอดโอน  [9]ยอดสด  [10]ผู้บันทึก  [11]ส่วนลด  [12]ยอดก่อนลด
// [13]สถานะชำระ  [14]ยอดรับจริง  [15]LastUpdated
//
// SC_Payments คอลัมน์ (7 คอล)
// [0]วันที่ขาย(อ้างอิง)  [1]วันที่รับเงิน  [2]จำนวน(฿)  [3]ช่องทาง  [4]ผู้รับ  [5]หมายเหตุ  [6]LastUpdated

function initSheets(ss) {
  var sheets = {
    "SC_Users": ["Username","PasswordHash","Fullname","Nickname","Role","Token","TokenExpiry"],
    "SC_Sales": ["วันที่","รายการพิเศษ/เลขบิล","ลูกค้า","Size_S","Size_M","Size_L","Size_XL",
                 "ยอดสุทธิ(฿)","ยอดโอน(฿)","ยอดสด(฿)","ผู้บันทึก","ส่วนลด(฿)","ยอดก่อนลด(฿)",
                 "สถานะชำระ","ยอดรับจริง(฿)","LastUpdated"],
    "SC_Payments": ["วันที่ขาย(อ้างอิง)","วันที่รับเงิน","จำนวน(฿)","ช่องทาง","ผู้รับ","หมายเหตุ","LastUpdated"],
    "SC_Stock_Transactions": ["วันที่","ประเภท","รายการวัสดุ","จำนวน","ราคาต่อหน่วย","ยอดรวม","ช่องชำระ","ผู้บันทึก","LastUpdated"],
    "SC_Stock_Status": ["รายการวัสดุ","หมวดหมู่","หน่วย","คงเหลือ","ราคาล่าสุด","จุดสั่งซื้อขั้นต่ำ","LastUpdated"],
    "SC_Expenses": ["วันที่","หมวดหมู่","รายการ","ยอดรวม","ช่องทางชำระ","ผู้บันทึก","LastUpdated"],
    "SC_Employees": ["ชื่อจริง","เงินเดือน","ตำแหน่ง","ธนาคาร","เลขบัญชี","สถานะ","ชื่อเล่น","LastUpdated"],
    "SC_Opex": ["เดือน","ประเภทค่าใช้จ่าย","Key","รายการ","ยอด(฿)","วิธีชำระ","ผู้บันทึก","LastUpdated"],
    "SC_Settings": ["SettingKey","SettingValue","LastUpdated"]
  };

  for (var name in sheets) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(sheets[name]);
      if (name === "SC_Users") {
        sh.appendRow(["admin", hashPassword("password123"), "Administrator", "Admin", "admin", "", ""]);
      }
    }
  }
}

// ── Utilities ─────────────────────────────────────────────────
function hashPassword(password) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  var txtHash = "";
  for (var i = 0; i < rawHash.length; i++) {
    var val = rawHash[i]; if (val < 0) val += 256;
    var b = val.toString(16); if (b.length == 1) b = "0" + b;
    txtHash += b;
  }
  return txtHash;
}

function generateToken() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var token = '';
  for (var i = 0; i < 32; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

function formatDateCell(val) {
  if (!val) return "";
  if (val instanceof Date) {
    var d = val.getDate();
    var m = val.getMonth() + 1;
    var y = val.getFullYear();
    return (d < 10 ? "0" + d : d) + "/" + (m < 10 ? "0" + m : m) + "/" + y;
  }
  var str = String(val).trim();
  if (!str) return "";
  if (str.indexOf('-') >= 0) {
    var parts = str.split('T')[0].split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
  }
  return str;
}

function formatMonthCell(val) {
  if (!val) return "";
  if (val instanceof Date) {
    var m = val.getMonth() + 1;
    var y = val.getFullYear();
    return (m < 10 ? "0" + m : m) + "/" + y;
  }
  var str = String(val).trim();
  if (!str) return "";
  if (str.indexOf('-') >= 0) {
    var parts = str.split('-');
    if (parts.length >= 2) {
      var m = Number(parts[1]);
      return (m < 10 ? "0" + m : m) + "/" + parts[0];
    }
  }
  if (str.indexOf('/') >= 0) {
    var parts = str.split('/');
    if (parts.length === 2) {
      var m = Number(parts[0]);
      return (m < 10 ? "0" + m : m) + "/" + parts[1];
    }
  }
  return str;
}

function validateToken(ss, token) {
  if (!token) return null;
  var sheet = ss.getSheetByName("SC_Users");
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][5] === token) {
      var expiry = new Date(data[i][6]);
      if (expiry > new Date()) {
        return { username: data[i][0], fullname: data[i][2], nickname: data[i][3], role: data[i][4], rowIndex: i + 1 };
      }
    }
  }
  return null;
}

// ── doGet ─────────────────────────────────────────────────────
function doGet(e) {
  try {
    var ss = getSS();
    initSheets(ss);
    var action = (e && e.parameter) ? e.parameter.action : "";

    // Validate session
    if (action === "validate") {
      var token = e.parameter.token;
      var user = validateToken(ss, token);
      if (user) {
        return json({ valid: true, role: user.role, display_name: user.nickname });
      }
      return json({ valid: false });
    }

    // Get sale data for a specific date
    if (action === "getSale") {
      var dateStr = formatDateCell(e.parameter.date);
      var user = validateToken(ss, e.parameter.token);
      if (!user) return json({ code: "unauthorized" });

      var saleSheet = ss.getSheetByName("SC_Sales");
      var saleData = saleSheet.getDataRange().getValues();
      for (var i = 1; i < saleData.length; i++) {
        if (formatDateCell(saleData[i][0]) === dateStr) {
          return json({
            found:           true,
            bill_no:         saleData[i][1],
            customer:        saleData[i][2],
            size_s:          Number(saleData[i][3]),
            size_m:          Number(saleData[i][4]),
            size_l:          Number(saleData[i][5]),
            size_xl:         Number(saleData[i][6]),
            total_amount:    Number(saleData[i][7]),
            transfer_amount: Number(saleData[i][8]) || 0,  // ยอดโอน
            cash_amount:     Number(saleData[i][9]) || 0,  // ยอดสด
            entered_by:      saleData[i][10] || "",
            discount:        Number(saleData[i][11]) || 0,
            gross_amount:    Number(saleData[i][12]) || Number(saleData[i][7])
          });
        }
      }
      return json({ found: false });
    }

    // Default: return master data (stock, settings, employees) - REQUIRE VALID TOKEN
    var token = (e && e.parameter) ? e.parameter.token : "";
    var user = validateToken(ss, token);
    if (!user) {
      return json({ status: "error", message: "unauthorized" });
    }

    var stockData    = ss.getSheetByName("SC_Stock_Status").getDataRange().getValues();
    var settingsData = ss.getSheetByName("SC_Settings").getDataRange().getValues();
    var empData      = ss.getSheetByName("SC_Employees").getDataRange().getValues();

    return json({ stock: stockData, settings: settingsData, employees: empData });

  } catch (error) {
    return json({ status: "error", message: error.toString() });
  }
}

// ── doPost ────────────────────────────────────────────────────
function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var ss = getSS();
    initSheets(ss);
    var formType = params.formType;

    // 1. LOGIN
    if (formType === "login") {
      var username = params.username.toLowerCase();
      var userSheet = ss.getSheetByName("SC_Users");
      var data = userSheet.getDataRange().getValues();
      var hashedPassword = hashPassword(params.password);
      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toLowerCase() === username && data[i][1] === hashedPassword) {
          var token = generateToken();
          var expiry = new Date(); expiry.setDate(expiry.getDate() + 7);
          userSheet.getRange(i + 1, 6).setValue(token);
          userSheet.getRange(i + 1, 7).setValue(expiry.toISOString());
          return json({ status: "ok", token: token, role: data[i][4], display_name: data[i][3], full_name: data[i][2], username: username });
        }
      }
      return json({ status: "error", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }

    // Verify token for all other requests
    var user = validateToken(ss, params.token);
    if (!user) return json({ code: "unauthorized", message: "Session Expired" });

    // 2. LOGOUT
    if (formType === "logout") {
      var userSheet = ss.getSheetByName("SC_Users");
      userSheet.getRange(user.rowIndex, 6).setValue("");
      userSheet.getRange(user.rowIndex, 7).setValue("");
      return json({ status: "ok" });
    }

    // 3. CHANGE PASSWORD
    if (formType === "change_password") {
      var userSheet = ss.getSheetByName("SC_Users");
      var targetUser = (params.target_user || "").toLowerCase();
      if (user.role === "admin" || user.username.toLowerCase() === targetUser) {
        var data = userSheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          if (data[i][0].toLowerCase() === targetUser) {
            userSheet.getRange(i + 1, 2).setValue(hashPassword(params.new_password));
            userSheet.getRange(i + 1, 6).setValue("");
            userSheet.getRange(i + 1, 7).setValue("");
            return json({ status: "ok" });
          }
        }
      }
      return json({ status: "error", message: "ไม่มีสิทธิ์ในการเปลี่ยนรหัสผ่าน" });
    }

    // 4. DAILY SALES — SC_Sales (14 คอลัมน์)
    if (formType === "sales_form" || formType === "update_sales_form") {
      var sheet = ss.getSheetByName("SC_Sales");
      var dateStr = formatDateCell(params.date);
      var foundRowIndex = -1;

      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (formatDateCell(data[i][0]) === dateStr) { foundRowIndex = i + 1; break; }
      }

      // col[8] = ยอดโอน (transfer_amount), col[9] = ยอดสด (cash_amount)
      var transferAmt = Number(params.pay_method || params.transfer_amount || 0);
      var cashAmt     = Number(params.employee   || params.cash_amount    || 0);
      var discount    = Number(params.discount    || 0);
      var gross       = Number(params.gross_amount || params.total_amount || 0);
      var enteredBy   = params.entered_by || params.logged_by || user.nickname;

      var rowData = [
        dateStr,
        params.bill_no    || "",                    // [1] รายการพิเศษ JSON หรือเลขบิล
        params.customer   || "ยอดรวมประจำวัน",      // [2]
        Number(params.size_s  || 0),                // [3]
        Number(params.size_m  || 0),                // [4]
        Number(params.size_l  || 0),                // [5]
        Number(params.size_xl || 0),                // [6]
        Number(params.total_amount || 0),           // [7] ยอดสุทธิ
        transferAmt,                                // [8] ยอดโอน
        cashAmt,                                    // [9] ยอดสด
        enteredBy,                                  // [10] ผู้บันทึก
        discount,                                   // [11] ส่วนลด
        gross,                                      // [12] ยอดก่อนลด
        params.payment_status || "ชำระครบ",         // [13] สถานะชำระ
        Number(params.received_amount || params.total_amount || 0), // [14] ยอดรับจริง
        new Date().toISOString()                    // [15] LastUpdated
      ];

      if (foundRowIndex > 0) {
        if (formType === "update_sales_form" || params.overwrite) {
          sheet.getRange(foundRowIndex, 1, 1, rowData.length).setValues([rowData]);
          // Delete any extra duplicate rows for this date
          var latestData = sheet.getDataRange().getValues();
          for (var dIdx = latestData.length - 1; dIdx >= 1; dIdx--) {
            if ((dIdx + 1) !== foundRowIndex && formatDateCell(latestData[dIdx][0]) === dateStr) {
              sheet.deleteRow(dIdx + 1);
            }
          }
        } else {
          return json({ status: "duplicate" });
        }
      } else {
        sheet.appendRow(rowData);
      }
      return json({ status: "success" });
    }

    // 4b. PAYMENT RECEIPT — SC_Payments
    if (formType === "save_payment") {
      var sheet = ss.getSheetByName("SC_Payments");
      if (!sheet) {
        sheet = ss.insertSheet("SC_Payments");
        sheet.appendRow(["วันที่ขาย(อ้างอิง)","วันที่รับเงิน","จำนวน(฿)","ช่องทาง","ผู้รับ","หมายเหตุ","LastUpdated"]);
      }
      var saleDateFormatted = formatDateCell(params.sale_date);
      var receivedDateFormatted = formatDateCell(params.received_date);
      sheet.appendRow([
        saleDateFormatted,
        receivedDateFormatted,
        Number(params.amount || 0),
        params.method || "",
        params.received_by || user.nickname,
        params.note || "",
        new Date().toISOString()
      ]);
      // Update payment_status in SC_Sales row matching sale_date
      var salesSheet = ss.getSheetByName("SC_Sales");
      var salesData = salesSheet.getDataRange().getValues();
      for (var si = 1; si < salesData.length; si++) {
        if (formatDateCell(salesData[si][0]) === saleDateFormatted) {
          var total = Number(salesData[si][7] || 0);
          // Sum all payments for this sale date
          var allPayments = sheet.getDataRange().getValues();
          var totalPaid = Number(salesData[si][14] || 0); // col[14] = ยอดรับจริงเดิม
          for (var pi = 1; pi < allPayments.length; pi++) {
            if (formatDateCell(allPayments[pi][0]) === saleDateFormatted) totalPaid += Number(allPayments[pi][2] || 0);
          }
          var newStatus = totalPaid >= total ? "ชำระครบ" : "ชำระบางส่วน";
          // SC_Sales now has 16 cols: [13]=สถานะชำระ, [14]=ยอดรับจริง
          if (salesData[si].length >= 14) {
            salesSheet.getRange(si + 1, 14, 1, 2).setValues([[newStatus, totalPaid]]);
          }
          break;
        }
      }
      return json({ status: "success" });
    }

    // 5. EXPENSES
    if (formType === "expense_form") {
      var sheet = ss.getSheetByName("SC_Expenses");
      sheet.appendRow([
        formatDateCell(params.date), params.category, params.item_name,
        Number(params.total_amount), params.pay_method,
        params.entered_by || params.logged_by || user.nickname,
        new Date().toISOString()
      ]);
      return json({ status: "success" });
    }

    // 6. STOCK TRANSACTION
    if (formType === "stock_transaction_form") {
      var sheet = ss.getSheetByName("SC_Stock_Transactions");
      var qty   = Number(params.qty || 0);
      var price = Number(params.price_per_unit || 0);
      var total = Number(params.total_amount || 0);
      sheet.appendRow([
        formatDateCell(params.date), params.type, params.item_name,
        qty, price, total, params.pay_method || "",
        params.entered_by || params.logged_by || user.nickname,
        new Date().toISOString()
      ]);
      var qtyChange = (params.type === "ซื้อเข้า") ? qty : -qty;
      updateStockBalance(ss, params.item_name, qtyChange, price, params.category, params.unit, params.date);
      return json({ status: "success" });
    }

    // 7. SAVE OPEX
    if (formType === "save_opex") {
      var sheet = ss.getSheetByName("SC_Opex");
      var month = formatMonthCell(params.month);
      var data  = sheet.getDataRange().getValues();
      for (var i = data.length - 1; i >= 1; i--) {
        if (formatMonthCell(data[i][0]) === month) sheet.deleteRow(i + 1);
      }
      var items = params.items || [];
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        sheet.appendRow([
          month, it.category, it.key, it.name,
          Number(it.amount), it.method,
          params.entered_by || params.logged_by || user.nickname,
          new Date().toISOString()
        ]);
      }
      return json({ status: "success" });
    }

    // 8. SAVE BIZ INFO / SETTINGS (รวมราคา Size)
    if (formType === "save_biz_info") {
      var sheet    = ss.getSheetByName("SC_Settings");
      var settings = params.settings || {};
      for (var key in settings) {
        var val   = settings[key];
        var found = false;
        var data  = sheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          if (data[i][0] === key) {
            sheet.getRange(i + 1, 2).setValue(val);
            sheet.getRange(i + 1, 3).setValue(new Date().toISOString());
            found = true; break;
          }
        }
        if (!found) sheet.appendRow([key, val, new Date().toISOString()]);
      }
      return json({ status: "success" });
    }

    // 9. SAVE EMPLOYEE CONFIG
    if (formType === "save_emp_config") {
      var sheet = ss.getSheetByName("SC_Employees");
      sheet.clearContents();
      sheet.appendRow(["ชื่อจริง","เงินเดือน","ตำแหน่ง","ธนาคาร","เลขบัญชี","สถานะ","ชื่อเล่น","LastUpdated"]);
      var emps = params.employees || [];
      for (var j = 0; j < emps.length; j++) {
        sheet.appendRow([
          emps[j].name, Number(emps[j].salary || 0), emps[j].position || "",
          emps[j].bank || "", emps[j].account_no || "", emps[j].status || "Active",
          emps[j].nickname || "", new Date().toISOString()
        ]);
      }
      return json({ status: "success" });
    }

    // 10. EXPORT
    if (formType === "export") {
      var response = {};
      ["SC_Sales","SC_Stock_Transactions","SC_Stock_Status","SC_Expenses","SC_Employees","SC_Opex"].forEach(function(sName) {
        var s = ss.getSheetByName(sName);
        response[sName] = s ? s.getDataRange().getValues() : [];
      });
      return json({ status: "success", data: response });
    }

    // 11. LIST MONTHLY DATA
    if (formType === "list_monthly") {
      var months = params.months || [];
      var sales = [], expenses = [], opex = [];

      var sData  = getSheetData(ss, "SC_Sales");
      var eData  = getSheetData(ss, "SC_Expenses");
      var oData  = getSheetData(ss, "SC_Opex");
      var stData = getSheetData(ss, "SC_Stock_Transactions");

      // Sales: date = DD/MM/YYYY → match MM/YYYY (deduplicate keeping first record)
      var seenSaleDates = {};
      for (var a = 1; a < sData.length; a++) {
        var row = sData[a].slice();
        row[0] = formatDateCell(row[0]);
        var parts = row[0].split('/');
        if (parts.length === 3 && months.indexOf(parts[1] + '/' + parts[2]) >= 0) {
          if (!seenSaleDates[row[0]]) {
            seenSaleDates[row[0]] = true;
            sales.push(row);
          }
        }
      }
      // Expenses (deduplicate keeping first record per date+category+item)
      var seenExpKeys = {};
      for (var b = 1; b < eData.length; b++) {
        var row = eData[b].slice();
        row[0] = formatDateCell(row[0]);
        var parts = row[0].split('/');
        if (parts.length === 3 && months.indexOf(parts[1] + '/' + parts[2]) >= 0) {
          var expKey = row[0] + '|' + row[1] + '|' + row[2];
          if (!seenExpKeys[expKey]) {
            seenExpKeys[expKey] = true;
            expenses.push(row);
          }
        }
      }
      // Stock buy-ins as expenses
      for (var c = 1; c < stData.length; c++) {
        if (stData[c][1] === "ซื้อเข้า") {
          var formattedDate = formatDateCell(stData[c][0]);
          var parts = formattedDate.split('/');
          if (parts.length === 3 && months.indexOf(parts[1] + '/' + parts[2]) >= 0) {
            var stExpKey = formattedDate + '|ต้นทุนวัสดุคลัง|' + stData[c][2];
            if (!seenExpKeys[stExpKey]) {
              seenExpKeys[stExpKey] = true;
              expenses.push([formattedDate,"ต้นทุนวัสดุคลัง",stData[c][2],stData[c][5],stData[c][6],stData[c][7],stData[c][8]]);
            }
          }
        }
      }
      // Opex: month field is MM/YYYY directly (deduplicate keeping first record per month+key)
      var seenOpexKeys = {};
      for (var d = 1; d < oData.length; d++) {
        var row = oData[d].slice();
        row[0] = formatMonthCell(row[0]);
        if (months.indexOf(row[0]) >= 0) {
          var oKey = row[0] + '|' + row[2];
          if (!seenOpexKeys[oKey]) {
            seenOpexKeys[oKey] = true;
            opex.push(row);
          }
        }
      }

      // Payments: match by sale_date DD/MM/YYYY
      var payments = [];
      var pData = getSheetData(ss, "SC_Payments");
      if (pData) {
        for (var pe = 1; pe < pData.length; pe++) {
          var prow = pData[pe].slice();
          prow[0] = formatDateCell(prow[0]);
          prow[1] = formatDateCell(prow[1]);
          var pparts = prow[0].split('/');
          if (pparts.length === 3 && months.indexOf(pparts[1] + '/' + pparts[2]) >= 0) payments.push(prow);
        }
      }

      return json({ status: "success", sales: sales, expenses: expenses, opex: opex, payments: payments });
    }

    // 12. DELETE MONTH
    if (formType === "delete_month") {
      if (user.role !== "admin" && user.role !== "co-admin") return json({ code: "forbidden" });
      var targetMonth = formatMonthCell(params.month);
      var category    = params.category;
      var toDelete = [];
      if (category === "all" || category === "sales")   toDelete.push("SC_Sales");
      if (category === "all" || category === "expense") toDelete.push("SC_Expenses");
      if (category === "all" || category === "opex")    toDelete.push("SC_Opex");
      if (category === "all" || category === "stock")   toDelete.push("SC_Stock_Transactions");

      for (var s = 0; s < toDelete.length; s++) {
        var sh = ss.getSheetByName(toDelete[s]);
        if (!sh) continue;
        var data = sh.getDataRange().getValues();
        for (var row = data.length - 1; row >= 1; row--) {
          var match = false;
          if (toDelete[s] === "SC_Opex") {
            match = (formatMonthCell(data[row][0]) === targetMonth);
          } else {
            var formattedDate = formatDateCell(data[row][0]);
            var parts = formattedDate.split('/');
            match = (parts.length === 3 && parts[1] + '/' + parts[2] === targetMonth);
          }
          if (match) sh.deleteRow(row + 1);
        }
      }
      return json({ status: "success" });
    }

    // 13. USER MANAGEMENT (Admin only)
    if (user.role !== "admin") return json({ code: "forbidden" });
    var userSheet = ss.getSheetByName("SC_Users");

    if (formType === "list_users") {
      var data = userSheet.getDataRange().getValues();
      var users = [];
      for (var i = 1; i < data.length; i++) {
        users.push({ username: data[i][0], fullname: data[i][2], nickname: data[i][3], role: data[i][4], has_token: (data[i][5] !== "") });
      }
      return json({ status: "ok", users: users });
    }

    if (formType === "create_user") {
      var newUsername = params.username.toLowerCase();
      var data = userSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toLowerCase() === newUsername) return json({ status: "error", message: "ชื่อผู้ใช้นี้มีอยู่แล้ว" });
      }
      userSheet.appendRow([newUsername, hashPassword(params.password), params.full_name, params.nickname, params.role, "", ""]);
      return json({ status: "ok" });
    }

    if (formType === "update_user") {
      var targetUser = params.username.toLowerCase();
      var data = userSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toLowerCase() === targetUser) {
          userSheet.getRange(i + 1, 3).setValue(params.full_name);
          userSheet.getRange(i + 1, 4).setValue(params.nickname);
          userSheet.getRange(i + 1, 5).setValue(params.role);
          userSheet.getRange(i + 1, 6).setValue("");
          userSheet.getRange(i + 1, 7).setValue("");
          return json({ status: "ok" });
        }
      }
      return json({ status: "error", message: "ไม่พบผู้ใช้" });
    }

    if (formType === "delete_user") {
      var targetUser = params.username.toLowerCase();
      if (targetUser === user.username.toLowerCase()) return json({ status: "error", message: "ไม่สามารถลบบัญชีของตัวเองได้" });
      var data = userSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toLowerCase() === targetUser) { userSheet.deleteRow(i + 1); return json({ status: "ok" }); }
      }
      return json({ status: "error", message: "ไม่พบผู้ใช้" });
    }

    if (formType === "reset_user_password") {
      var targetUser = params.username.toLowerCase();
      var data = userSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toLowerCase() === targetUser) {
          userSheet.getRange(i + 1, 2).setValue(hashPassword(params.new_password));
          userSheet.getRange(i + 1, 6).setValue("");
          userSheet.getRange(i + 1, 7).setValue("");
          return json({ status: "ok" });
        }
      }
      return json({ status: "error", message: "ไม่พบผู้ใช้" });
    }

    return json({ status: "error", message: "ไม่พบฟังก์ชันที่เรียก: " + formType });

  } catch (error) {
    return json({ status: "error", message: error.toString() });
  }
}

// ── Helpers ───────────────────────────────────────────────────
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheetData(ss, name) {
  var sh = ss.getSheetByName(name);
  return sh ? sh.getDataRange().getValues() : [[]];
}

function updateStockBalance(ss, itemName, qtyChange, pricePerUnit, category, unit, dateStr) {
  var sheet = ss.getSheetByName("SC_Stock_Status");
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === itemName) {
      var newQty = Math.max(0, Number(data[i][3] || 0) + qtyChange);
      sheet.getRange(i + 1, 4).setValue(newQty);
      if (pricePerUnit > 0) sheet.getRange(i + 1, 5).setValue(pricePerUnit);
      sheet.getRange(i + 1, 7).setValue(new Date().toISOString());
      return;
    }
  }
  sheet.appendRow([itemName, category || "ทั่วไป", unit || "ชิ้น", Math.max(0, qtyChange), pricePerUnit, 10, new Date().toISOString()]);
}
