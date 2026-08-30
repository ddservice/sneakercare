/**
 * ETDA Standard e-Tax Invoice XML Generator (ขมธอ. 3-2560)
 * Compliant with Electronic Transactions Development Agency (ETDA) Schema
 */

export type ETaxDocumentData = {
  docNumber: string;
  docTypeCode: "380" | "388" | "80" | "T01"; // 380 = Tax Invoice, 388 = Tax Invoice/Receipt, 80 = Debit Note
  issueDate: Date;
  seller: {
    taxId: string;
    branchCode: string;
    name: string;
    address: string;
    phone?: string;
    email?: string;
  };
  buyer: {
    taxId?: string;
    branchCode?: string;
    name: string;
    address: string;
    email?: string;
  };
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
};

export function generateETaxXML(data: ETaxDocumentData): string {
  const formattedDate = data.issueDate.toISOString().replace(/\.\d+Z$/, "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:TaxInvoice_CrossIndustryInvoice
  xmlns:rsm="urn:etda:uncefact:data:standard:TaxInvoice_CrossIndustryInvoice:2"
  xmlns:ram="urn:etda:uncefact:data:standard:TaxInvoice_ReusableAggregateBusinessInformationEntity:2"
  xmlns:qdt="urn:etda:uncefact:data:standard:QualifiedDataType:2"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:16">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID schemeAgencyID="ETDA" schemeVersionID="v2.0">ER3-2560</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${data.docNumber}</ram:ID>
    <ram:Name>ใบกำกับภาษี / ใบเสร็จรับเงิน</ram:Name>
    <ram:TypeCode>${data.docTypeCode}</ram:TypeCode>
    <ram:IssueDateTime>${formattedDate}</ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <!-- Seller Info -->
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${data.seller.name}</ram:Name>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="TXID">${data.seller.taxId}</ram:ID>
        </ram:SpecifiedTaxRegistration>
        <ram:PostalTradeAddress>
          <ram:LineOne>${data.seller.address}</ram:LineOne>
          <ram:CountryID>TH</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:SellerTradeParty>
      <!-- Buyer Info -->
      <ram:BuyerTradeParty>
        <ram:Name>${data.buyer.name}</ram:Name>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="TXID">${data.buyer.taxId || "N/A"}</ram:ID>
        </ram:SpecifiedTaxRegistration>
        <ram:PostalTradeAddress>
          <ram:LineOne>${data.buyer.address}</ram:LineOne>
          <ram:CountryID>TH</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <!-- Monetary Summation -->
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>THB</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount currencyID="THB">${data.subtotal.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount currencyID="THB">${data.subtotal.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="THB">${data.vatAmount.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount currencyID="THB">${data.grandTotal.toFixed(2)}</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:TaxInvoice_CrossIndustryInvoice>`;
}
