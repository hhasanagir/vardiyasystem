export interface ServiceContract {
  id: string;
  contractNumber: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  supplierId: string | null;
  supplierName: string | null;
  value: number;
  currency: string;
  startDate: string;
  endDate: string;
  renewalDate: string | null;
  autoRenew: boolean;
  paymentTerms: string | null;
  terms: string | null;
  attachments: string[];
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}
