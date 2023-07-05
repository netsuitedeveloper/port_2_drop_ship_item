# Drop Ship Items (2017)

![demo](/img/Splitting_Orders_Diagram_.png)

## Requirement

```bash
- Restlet on N_B
  Create a sales order from N_A

- Userevent Script on N_B
  UE on ItemFulfillment (of N_B) and send item fulfillment info to N_A to mark as Shipped SO on N_A and send tracking numbers, notify customer

- Scheduled Script on N_A
  Check not submitted purchase orders (of N_A) and send salesorder info to N_B

- Userevent Script on N_A
  Userevent on purchase order (of N_A) and send salesorder info to N_B

```

## Source Scripts

1. [Restlet on N_B](/scripts/Restlet_Create_SO.js)

2. [Userevent Script on N_B](/scripts/UE_CS_IF.js)

3. [Scheduled Script on N_A](/scripts/SCH_PC_PO.js)

4. [Userevent Script on N_A](/scripts/UE_PC_PO_send_SO_Info.js)
