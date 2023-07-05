function replacer(key, value) {
  if (typeof value === "number" && !isFinite(value)) {
    return String(value);
  }
  return value;
}

//get Cusotmer Logo's content to be sent to CS
function getCustomerLogo(logofileid) {
  try {
    var f = nlapiLoadFile(logofileid);
    nlapiLogExecution(
      "debug",
      "Event",
      "Type: " + type + " File: " + f.getId()
    );
    return f.getValue();
  } catch (err) {
    nlapiLogExecution(
      "debug",
      "Event",
      "An error occurred when trying to load the file."
    );
    return null;
  }
  return null;
}

//get current SalesOrder (Transaction) PDF's content to be sent to CS
function getSOPDF(soid) {
  try {
    var f = nlapiPrintRecord("TRANSACTION", soid, "PDF", null);
    nlapiLogExecution(
      "debug",
      "Event",
      "Type: " + type + " File: " + f.getId()
    );
    var pdf = {
      content: f.getValue(),
      desc: f.getDescription(),
      encd: f.getEncoding(),
      type: f.getType(),
    };
    nlapiLogExecution("Debug", "PDF ret", JSON.stringify(pdf));

    return pdf;
  } catch (err) {
    nlapiLogExecution(
      "debug",
      "Event",
      "An error occurred when trying to load the file."
    );
    return null;
  }
  return null;
}

//Main Function : UE on PO_PC and Send SO Info to CS
function afterSubmit(type) {
  nlapiLogExecution("Debug", "AfterSubmit " + type);

  if (type != "create") {
    if (type === "edit") {
      var csinid = nlapiLookupField(
        "purchaseorder",
        nlapiGetRecordId(),
        "custbody_po_cssoinid"
      );
      if (parseInt(csinid) > 0) {
        return null;
      }
    }
  }

  //TODO: check if line type is CS
  var productline = "CS";

  if (productline !== "CS") return null;

  nlapiLogExecution(
    "Debug",
    "AfterSubmit Is Started : ",
    "Purchase Order Is Created."
  );
  var createdFrom = nlapiGetFieldValue("createdfrom"); //created from Sales Order
  var userid = nlapiLookupField("salesorder", createdFrom, "entity");
  var logofileid = nlapiLookupField("customer", userid, "custentity_phys_logo");
  var salesrep = nlapiLookupField("salesorder", createdFrom, "salesrep");
  var fields = ["entityid", "email", "phone"];
  var empinfo = nlapiLookupField("employee", salesrep, fields);
  var entity = empinfo.entityid;
  var email = empinfo.email;
  var phone = empinfo.phone;

  if (createdFrom) {
    nlapiLogExecution("Debug", "Entered Created From");

    try {
      var shipmethod_id = nlapiGetFieldValue("shipmethod");
      var shipmethod_rec = nlapiLoadRecord("shipItem", shipmethod_id);
      var shipmethod = shipmethod_rec.getFieldValue("itemid");

      var shipaddress = {
        name: nlapiGetFieldValue("shipaddressee"),
        shipaddr1: nlapiGetFieldValue("shipaddr1"),
        shipaddr2: nlapiGetFieldValue("shipaddr2"),
        shipcity: nlapiGetFieldValue("shipcity"),
        shipcountry: nlapiGetFieldValue("shipcountry"),
        shipphone: nlapiGetFieldValue("shipphone"),
        shipstate: nlapiGetFieldValue("shipstate"),
        shipzip: nlapiGetFieldValue("shipzip"),
      };
      var pdfcontent = getSOPDF(createdFrom);
      nlapiLogExecution("debug", "PDF file fetched");

      //Setting up Datainput
      var csso = {
        pc_so_id: createdFrom,
        pc_po_id: nlapiGetRecordId(),
        pc_resp:
          "Name: " +
          entity +
          "\n" +
          "Phone: " +
          phone +
          "\n" +
          "Email: " +
          email,
        shipmethod: shipmethod,
        shipaddress: shipaddress,
        products: getCSItemsToOrder(),
        sopdf: pdfcontent,
        logo: getCustomerLogo(logofileid),
      };

      nlapiLogExecution("debug", "JSON prepared", JSON.stringify(csso));

      if (!csso.logo) {
        nlapiLogExecution(
          "debug",
          "Do not Sending PO info to CS because Logo is NuLL"
        );
        return null;
      }

      nlapiLogExecution("Debug", "Sending PO info to CS ");
      var csresp = sendSOtoCS(csso);
      nlapiLogExecution("Debug", "Done Sending PO info to CS ");

      if (csresp.success) {
        nlapiLogExecution("Debug", "SEtting PO info ");

        var po = nlapiLoadRecord("purchaseorder", nlapiGetRecordId());
        po.setFieldValue("customform", 134);
        po.setFieldValue("custbody_po_csso_created", "T");
        po.setFieldValue("custbody_po_cssoinid", parseInt(csresp.soid));
        po.setFieldValue("custbody_po_cssoid", csresp.tranid);
        po.setFieldValue("custbody_sync_po_to_cs", "T");
        nlapiSubmitRecord(po);
      }
    } catch (e) {
      nlapiLogExecution("ERROR", "Fatal Error: ", e);
    }
  }
}

function getCSItemsToOrder() {
  var csproducts = [];
  var itemCount = nlapiGetLineItemCount("item");

  for (var i = 1; i <= itemCount; i++) {
    var item_info = [];

    var item = nlapiGetLineItemValue("item", "item", i);
    var vendorname = nlapiGetLineItemValue("item", "vendorname", i);
    var rate = nlapiGetLineItemValue("item", "rate", i);
    var lineamt = nlapiGetLineItemValue("item", "amount", i);
    var quantity = nlapiGetLineItemValue("item", "quantity", i);
    //Get the item type
    var fields = ["type", "itemid", "vendorname", "cost"];
    var iteminfotmp = nlapiLookupField("item", item, fields);

    var itemType = iteminfotmp.type;
    var itemid = iteminfotmp.itemid;
    var upccode = iteminfotmp.vendorname;
    var unitprice = iteminfotmp.cost / 12;

    item_info.push(vendorname);
    item_info.push(rate);
    item_info.push(quantity);
    item_info.push(itemid);
    item_info.push(upccode);

    var iteminfo = {
      vendorname: vendorname,
      unitprice: unitprice,
      amt: quantity * 12 * unitprice,
      quantity: quantity * 12, //each case has 12 units
      itemid: itemid,
      upccode: upccode,
    };

    csproducts.push(iteminfo);
  }

  return csproducts;
}

function sendSOtoCS(soinfo) {
  try {
    var remoteAccountID = "TSTDRV1015773";
    var restletUrl =
      "https://rest.na1.netsuite.com/app/site/hosting/restlet.nl?script=321&deploy=1";

    var token = {
      key: "***",
      secret: "***",
    };

    var oauth = OAuth({
      consumer: {
        key: "***",
        secret: "***",
      },
      signature_method: "HMAC-SHA1",
      hash_function: function (base_string, key) {
        return CryptoJS.HmacSHA1(base_string, key).toString(
          CryptoJS.enc.Base64
        );
      },
    });

    var HTTP_METHOD = "POST";
    var JSON_TEXT_PAYLOAD = JSON.stringify(soinfo, replacer);

    var request_data = {
      url: restletUrl,
      method: HTTP_METHOD,
      data: {},
    };

    var oauth_data = {
      oauth_consumer_key: oauth.consumer.key,
      oauth_nonce: oauth.getNonce(),
      oauth_signature_method: oauth.signature_method,
      oauth_timestamp: oauth.getTimeStamp(),
      oauth_version: "1.0",
      oauth_token: token.key,
    };

    //Generating the Header
    var headerWithRealm = oauth.toHeader(oauth.authorize(request_data, token));
    headerWithRealm.Authorization += ', realm="' + remoteAccountID + '"';

    nlapiLogExecution(
      "Debug",
      "headerWithRealm.Authorization",
      headerWithRealm.Authorization
    );

    //Setting up Headers
    var headers = {
      "User-Agent": "PC_UE_TBA",
      Authorization: headerWithRealm.Authorization,
      "Content-Type": "application/json",
    };

    var JSONTextHeaders = JSON.stringify(headers);

    var restResponse = nlapiRequestURL(
      restletUrl,
      JSON_TEXT_PAYLOAD,
      headers,
      HTTP_METHOD
    );
    nlapiLogExecution("Debug", "restResponse Body", restResponse.getBody());

    return JSON.parse(restResponse.getBody());
  } catch (e) {
    //var err = createErrorLogRecord("TBA Error", 'Fatal Error: ' + e);
    nlapiLogExecution("Debug", "Fatal Error", e);
    return err;
  }
}
