function replacer(key, value) {
  if (typeof value === "number" && !isFinite(value)) {
    return String(value);
  }
  return value;
}

function afterSubmit(type) {
  nlapiLogExecution("debug", "type: " + type);

  if (type == "edit" || type == "create") {
    nlapiLogExecution("debug", "Executing code");

    var invidexist = nlapiGetFieldValue("custbody_pc_invid");
    nlapiLogExecution("debug", "Invoice ID", invidexist);
    if (invidexist) {
      return null;
    }

    nlapiLogExecution(
      "Debug",
      "AfterSubmit Is Started : ",
      "Item Fulfillment Is Created."
    );
    var createdFrom = nlapiGetFieldValue("createdfrom"); //created from Sales Order

    if (createdFrom != "" || createdFrom != null) {
      try {
        var so = nlapiLoadRecord("salesorder", createdFrom);

        //Setting up Datainput
        var pcif = {
          pc_so_id: so.getFieldValue("custbody_sincerus_so"),
          pc_po_id: so.getFieldValue("custbody_pc_po_id"),
          trac_num: nlapiGetLineItemValue(
            "package",
            "packagetrackingnumber",
            1
          ),
          cs_invoice_id: createInvoice(createdFrom),
          cs_if_id: nlapiGetRecordId(),
        };
        nlapiLogExecution(
          "Debug",
          "JSON_TEXT_PAYLOAD",
          JSON.stringify(pcif, replacer)
        );

        ifresp = sendIFtoPC(pcif);

        if (ifresp.success) {
          nlapiSubmitField(
            "itemfulfillment",
            nlapiGetRecordId(),
            "custbody_pc_if_id",
            ifresp.ifid
          );
          nlapiSubmitField(
            "itemfulfillment",
            nlapiGetRecordId(),
            "custbody_pc_invid",
            ifresp.vbId
          );
        }
      } catch (e) {
        nlapiLogExecution("ERROR", "Fatal Error: " + e);
      }
    } else {
      nlapiLogExecution("ERROR", "createdfrom SO does not exist: ");
    }
  }
}

function sendIFtoPC(ifinfo) {
  try {
    var remoteAccountID = "3967321";
    //		var restletUrl = 'https://rest.na1.netsuite.com/app/site/hosting/restlet.nl?script=321&deploy=1';
    var restletUrl =
      "https://rest.sandbox.netsuite.com/app/site/hosting/restlet.nl?script=290&deploy=1";
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
    var JSON_TEXT_PAYLOAD = JSON.stringify(ifinfo, replacer);

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
    nlapiLogExecution("Debug", "Fatal Error", e);
    return null;
  }
}

function createInvoice(createdFrom) {
  try {
    //Create Invoice from new Sales Order
    /*	var invoice = nlapiTransformRecord('salesorder', nlapiGetFieldValue('createdfrom'), 'invoice');
		 var invoiceid = nlapiSubmitRecord(invoice);
		 nlapiLogExecution('DEBUG', 'Invoice Created ' , invoiceid);
		 return invoiceid;
		 */

    var soRec = nlapiLoadRecord("salesorder", createdFrom);

    var record = nlapiCreateRecord("invoice");

    record.setFieldValue("location", soRec.getFieldValue("location"));
    record.setFieldValue("customform", "178");
    record.setFieldValue("createdfrom", createdFrom);
    record.setFieldValue("entity", soRec.getFieldValue("entity"));

    for (var i = 1; i <= nlapiGetLineItemCount("item"); i++) {
      record.selectNewLineItem("item");
      record.setCurrentLineItemValue(
        "item",
        "item",
        nlapiGetLineItemValue("item", "item", i)
      );
      record.setCurrentLineItemValue(
        "item",
        "quantity",
        nlapiGetLineItemValue("item", "quantity", i)
      );
      record.setCurrentLineItemValue(
        "item",
        "amount",
        soRec.getLineItemValue("item", "amount", i)
      );
      //			record.setCurrentLineItemValue('item', 'rate', nlapiGetLineItemValue('item', 'rate', i));
      record.commitLineItem("item");
    }

    var recordId = nlapiSubmitRecord(record);
    nlapiLogExecution("DEBUG", "Invoice Created ", recordId);

    return "CS Invoice " + recordId;
  } catch (e) {
    nlapiLogExecution("Debug", "Fatal Error on Create Invoice", e);
    return null;
  }
}
