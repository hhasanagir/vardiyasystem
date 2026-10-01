export interface Supplier {
  id: string;
  name: string;
  code: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string;
  taxNumber: string | null;
  registrationNumber: string | null;
  rating: number | null;
  status: string;
  categories: string[];
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}
