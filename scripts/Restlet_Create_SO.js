//Creates a single sales order
function createSO(JSON_Data) {
  try {
    var PC_CUSTOMER = 2680;
    nlapiLogExecution("DEBUG", "JSON_DATA", JSON.stringify(JSON_Data.sopdf));

    var so = nlapiCreateRecord("salesorder");
    var entityID = PC_CUSTOMER; //findPCCustomer(JSON_Data.email);

    if (entityID != 0) {
      so.setFieldValue("entity", entityID);
    } else {
      createErrorLogRecord(
        JSON_Data,
        "Customer Not Found - " + JSON_Data.email
      );
      return null;
    }

    //Set shipping Address
    var shippingAddress = JSON_Data.shipaddress;
    so.setFieldValue("shipaddressee", shippingAddress["name"]);
    so.setFieldValue(
      "shipaddr1",
      shippingAddress["shipaddr1"] + " " + shippingAddress["shipaddr2"]
    );
    so.setFieldValue("shipcity", shippingAddress["shipcity"]);
    so.setFieldValue("shipcountry", shippingAddress["shipcountry"]);
    so.setFieldValue("shipphone", shippingAddress["shipphone"]);
    so.setFieldValue("shipstate", shippingAddress["shipstate"]);
    so.setFieldValue("shipzip", shippingAddress["shipzip"]);

    //Set PC SalesOrder, PurchaseOrder IDs into custom fields on SalesOrder
    so.setFieldValue("custbody_sincerus_so", JSON_Data.pc_so_id);
    so.setFieldValue("custbody_pc_po_id", JSON_Data.pc_po_id);
    so.setFieldValue("memo", JSON_Data.pc_resp);

    //TODO: Get ShipMethod ID using ShipMethod Name from PC
    var shippingMethod = findShippingMethod(JSON_Data.shipmethod);
    if (shippingMethod != 0) {
      so.setFieldValue("shipmethod", shippingMethod);
    } else {
      createErrorLogRecord(
        JSON_Data,
        "ShipMethod Not Found - " + JSON_Data.shipmethod
      );
      return null;
    }

    //Add Line Items
    for (z = 0; z < JSON_Data.products.length; z++) {
      if (JSON_Data.products[z]["upccode"] == "") {
        createErrorLogRecord(JSON_Data, "Product Not Found, UPCCode Is Empty");
        return null;
      }

      var internalId = findItemInternalId(JSON_Data.products[z]["upccode"]);

      if (internalId != 0) {
        so.setLineItemValue("item", "item", z + 1, internalId);
        so.setLineItemValue(
          "item",
          "quantity",
          z + 1,
          JSON_Data.products[z]["quantity"]
        );
        so.setLineItemValue(
          "item",
          "amount",
          z + 1,
          JSON_Data.products[z]["amt"]
        );
        so.setLineItemValue(
          "item",
          "rate",
          z + 1,
          JSON_Data.products[z]["unitprice"]
        );
      } else {
        createErrorLogRecord(
          JSON_Data,
          "Product Not Found, UPCCode - " + JSON_Data.products[z]["upccode"]
        );
        return null;
      }
    }

    //Create Sales Order
    var newso = nlapiSubmitRecord(so, true, true);
    nlapiLogExecution("debug", "newso", newso);
    var tranid = nlapiLookupField("salesorder", newso, "tranid");

    //Attach JPG Logo to SO
    var logo_id = createJPGFile(JSON_Data.logo, newso);
    nlapiLogExecution("debug", "logo_id", logo_id);
    //Attach JPG Logo to SO
    var pdf_id = createPDFFile(JSON_Data.sopdf, newso);
    nlapiLogExecution("debug", "pdf_id", pdf_id);

    createErrorLogRecord(
      JSON_Data,
      "Sales Order is created with success. Created SO ID : " + newso,
      "T"
    );

    return {
      success: true,
      soid: newso,
      tranid: tranid,
      msg: "Order Created Successfully",
    };
  } catch (e) {
    createErrorLogRecord(JSON_Data, "Fatal Error: " + e);
    return {
      success: false,
      //			pcsoid: JSON_Data.pc_so_id,
      msg: "Error occur creating order at CS, details " + JSON.stringify(e),
    };
  }
}

//Find ShipMethod Internalid based on Shipmethod Name
function findShippingMethod(shipmethod) {
  return 92;
  var filters = [];
  filters.push(new nlobjSearchFilter("displayname", null, "is", shipmethod));
  filters.push(new nlobjSearchFilter("isinactive", null, "is", "F"));

  var columns = [new nlobjSearchColumn("itemid")];
  var results = nlapiSearchRecord("shipItem", null, filters, columns);

  if (results != null && results.length > 0) {
    nlapiLogExecution("DEBUG", "ShipMethod Found", results[0].getId());
    return results[0].getId();
  }
  return 0;
}

//TODO: Find Item by its Display Name based on UPC from PC
function findItemInternalId(upccode) {
  var filters = [];
  var results = null;
  //	filters = [new nlobjSearchFilter('displayname', null, 'is', upccode)];
  filters = [new nlobjSearchFilter("upccode", null, "is", upccode)];
  results = nlapiSearchRecord("inventoryitem", null, filters, null);

  if (results == null) {
    nlapiLogExecution("DEBUG", "Assembly/Bill of Materials Item");
    results = nlapiSearchRecord("assemblyitem", null, filters, null);
  }

  if (results == null) {
    nlapiLogExecution("DEBUG", "Finding by kit item");
    results = nlapiSearchRecord("kititem", null, filters, null);
  }

  if (results == null) {
    nlapiLogExecution("DEBUG", "Finding by discount item");
    results = nlapiSearchRecord("discountitem", null, filters, null);
  }

  if (results != null && results.length > 0) {
    nlapiLogExecution("DEBUG", "Item Found", results[0].getId());
    return results[0].getId();
  }
  return 0;
}

//Find Customer Internalid based on PC Customer Email
function findPCCustomer(email) {
  var filters = [];
  filters.push(new nlobjSearchFilter("email", null, "is", email));
  filters.push(new nlobjSearchFilter("isinactive", null, "is", "F"));

  var columns = [new nlobjSearchColumn("email")];
  var results = nlapiSearchRecord("customer", null, filters, columns);

  if (results != null && results.length > 0) {
    nlapiLogExecution("DEBUG", "Customer Found", results[0].getId());
    return results[0].getId();
  }
  return 0;
}

//Create Error Log Custom Record with detailed Reason
function createErrorLogRecord(data, err, yn) {
  var log_rec = nlapiCreateRecord("customrecord_addition_rest_so_create");
  delete data.logo;
  delete data.sopdf;
  log_rec.setFieldValue("custrecord_json_data", JSON.stringify(data));
  log_rec.setFieldValue("custrecord_log_error", err);
  if (yn === undefined) {
    log_rec.setFieldValue("custrecord_so_success_yn", "F");
  } else {
    log_rec.setFieldValue("custrecord_so_success_yn", "T");
  }
  nlapiSubmitRecord(log_rec);
  nlapiLogExecution("ERROR", err);
  return null;
}

//removeFromObjectByKey
function removeFromObjectByKey(data, key) {
  delete data[key];
  return data;
}

//Create JPG Image File with content & will be displayed in the SO attached files on CS
function createJPGFile(file_content, soid) {
  var filename = "logo_so" + soid + ".jpg";
  var filex = nlapiCreateFile(filename, "JPGIMAGE", file_content);
  filex.setFolder(612);
  var fid = nlapiSubmitFile(filex);
  nlapiAttachRecord("file", fid, "salesorder", soid);
  return fid;
}

//Create PDF File with content & will be displayed in the SO attached files on CS
function createPDFFile(file_content, soid) {
  try {
    nlapiLogExecution("debug", "Saving PDF info", file_content.content);
    var filename = "pdf_so_" + soid + ".pdf";
    var filex = nlapiCreateFile(filename, "PDF", file_content.content);
    filex.setDescription(file_content.desc);
    filex.setFolder(612);
    var fid = nlapiSubmitFile(filex);
    nlapiAttachRecord("file", fid, "salesorder", soid);
    return fid;
  } catch (ex) {
    nlapiLogExecution("debug", "Errror Creating PDF ", ex);
  }
}
