export type CustomerStatus = "active" | "blocked";

export type Customer = {
  id: string;
  authUid?: string;
  authUids?: string[];
  mobileNumber?: string;
  phone?: string;
  name?: string;
  email?: string;
  status?: CustomerStatus;
  addresses?: CustomerAddress[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type CustomerAddress = {
  id?: string;
  label?: string;
  name?: string;
  mobileNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
};
