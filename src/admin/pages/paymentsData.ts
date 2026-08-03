// Comprehensive High-Fidelity Payment Data Center for BURGONOMICS Admin Portal
import { toast } from "sonner";
import { addDays, subDays } from "date-fns";
import { generateSecureId } from "@/shared/utils/cryptoUtils";

export interface TransactionDetails {
  id: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  gateway: string;
  gatewayPaymentId: string;
  status:
    | "CAPTURED"
    | "AUTHORIZED"
    | "PENDING"
    | "FAILED"
    | "CANCELLED"
    | "REFUNDED"
    | "PARTIALLY_REFUNDED"
    | "CHARGEBACK"
    | "DISPUTED"
    | "EXPIRED";
  verificationStatus: "VERIFIED" | "FAILED" | "UNVERIFIED";
  createdAt: string;
  capturedAt: string | null;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  store: {
    id: string;
    name: string;
  };
  timeline: Array<{
    status: string;
    title: string;
    description: string;
    time: string;
  }>;
  metadata: Record<string, string>;
  signature: string;
  webhookEvents: Array<{
    id: string;
    event: string;
    status: "DELIVERED" | "FAILED" | "RETRYING";
    time: string;
    payload: string;
  }>;
  refunds: Array<{
    id: string;
    amountPaise: number;
    reason: string;
    status: "PENDING" | "COMPLETED" | "FAILED";
    createdAt: string;
  }>;
  auditLogs: Array<{
    id: string;
    admin: string;
    action: string;
    timestamp: string;
    oldValue: string;
    newValue: string;
    ipAddress: string;
    device: string;
  }>;
}

export interface RefundDetails {
  id: string;
  paymentId: string;
  orderId: string;
  customerName: string;
  storeName: string;
  amountPaise: number;
  reason: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  processedBy: string;
  gatewayStatus: string;
  createdAt: string;
  completedAt: string | null;
}

export interface DiscrepancyDetails {
  id: string;
  orderId: string;
  paymentId: string;
  type:
    | "MISSING_PAYMENT"
    | "DUPLICATE_PAYMENT"
    | "FAILED_CAPTURE"
    | "AMOUNT_MISMATCH"
    | "SETTLEMENT_ISSUE"
    | "VERIFICATION_FAILURE";
  reason: string;
  internalAmountPaise: number;
  gatewayAmountPaise: number;
  status: "UNRESOLVED" | "RESOLVED";
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface DuplicateAttempt {
  id: string;
  orderId: string;
  customer: {
    name: string;
    phone: string;
  };
  gateway: string;
  timeDiff: string;
  amountPaise: number;
  probability: string;
  status: "UNRESOLVED" | "MERGED" | "IGNORED" | "INVESTIGATING";
}

// Initial high-fidelity seed data
const INITIAL_TRANSACTIONS: TransactionDetails[] = [
  {
    id: "pay_P1b7d8fa82b1",
    orderId: "BUR-8201",
    amountPaise: 42000,
    currency: "INR",
    gateway: "Razorpay UPI",
    gatewayPaymentId: "pay_OK8eF3js92l1",
    status: "CAPTURED",
    verificationStatus: "VERIFIED",
    createdAt: "2026-07-19 14:12:05",
    capturedAt: "2026-07-19 14:12:12",
    customer: {
      name: "Aarav Mehta",
      email: "aarav.mehta@gmail.com",
      phone: "+91 98765 43210",
    },
    store: { id: "str_001", name: "Burgonomics Navrangpura" },
    timeline: [
      {
        status: "created",
        title: "Payment Request Initialized",
        description: "Checkout order BUR-8201 token generated",
        time: "2026-07-19 14:11:58",
      },
      {
        status: "authorized",
        title: "Payment Authorized",
        description: "Authenticated successfully via UPI Handshake",
        time: "2026-07-19 14:12:05",
      },
      {
        status: "captured",
        title: "Payment Captured",
        description: "Funds successfully moved to Escrow pool",
        time: "2026-07-19 14:12:12",
      },
    ],
    metadata: {
      "Fulfillment Method": "Delivery (Dunzo)",
      "VPA Address": "aaravmehta@okaxis",
      "API Version": "v2/payments",
    },
    signature: "sha256_d8fa82b1c8f1e2f3d4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
    webhookEvents: [
      {
        id: "wh_1",
        event: "payment.authorized",
        status: "DELIVERED",
        time: "2026-07-19 14:12:06",
        payload:
          '{"event":"payment.authorized","payload":{"payment":{"entity":{"id":"pay_OK8eF3js92l1","status":"authorized"}}}}',
      },
      {
        id: "wh_2",
        event: "payment.captured",
        status: "DELIVERED",
        time: "2026-07-19 14:12:13",
        payload:
          '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_OK8eF3js92l1","status":"captured"}}}}',
      },
    ],
    refunds: [],
    auditLogs: [
      {
        id: "aud_1",
        admin: "System Auto-Process",
        action: "CAPTURE_SETTLED",
        timestamp: "2026-07-19 14:12:12",
        oldValue: "AUTHORIZED",
        newValue: "CAPTURED",
        ipAddress: "13.233.14.82",
        device: "AWS Lambda / Razorpay Webhook Engine",
      },
    ],
  },
  {
    id: "pay_P2d8f7ea12c3",
    orderId: "BUR-8202",
    amountPaise: 51000,
    currency: "INR",
    gateway: "Razorpay Card",
    gatewayPaymentId: "pay_OK8eM9js22a1",
    status: "CAPTURED",
    verificationStatus: "VERIFIED",
    createdAt: "2026-07-19 14:05:10",
    capturedAt: "2026-07-19 14:05:22",
    customer: {
      name: "Priya Sharma",
      email: "priya.sharma@yahoo.com",
      phone: "+91 91234 56789",
    },
    store: { id: "str_002", name: "Burgonomics Nehrunagar" },
    timeline: [
      {
        status: "created",
        title: "Payment Request Initialized",
        description: "Cart compiled, order token generated",
        time: "2026-07-19 14:04:55",
      },
      {
        status: "authorized",
        title: "Payment Authorized",
        description: "Visa 3DS Check completed successfully",
        time: "2026-07-19 14:05:10",
      },
      {
        status: "captured",
        title: "Payment Captured",
        description: "Auto-captured on dispatch trigger",
        time: "2026-07-19 14:05:22",
      },
    ],
    metadata: {
      "Card Network": "Visa Credit (HDFC Bank)",
      "Card Mask": "**** **** **** 8201",
      "Merchant Code": "BURG_NEHRU_01",
    },
    signature: "sha256_3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c",
    webhookEvents: [
      {
        id: "wh_3",
        event: "payment.captured",
        status: "DELIVERED",
        time: "2026-07-19 14:05:23",
        payload: '{"event":"payment.captured"}',
      },
    ],
    refunds: [],
    auditLogs: [],
  },
  {
    id: "pay_P3d9f0ea56d9",
    orderId: "BUR-8203",
    amountPaise: 31000,
    currency: "INR",
    gateway: "Razorpay UPI",
    gatewayPaymentId: "pay_OK8eY9js52b4",
    status: "AUTHORIZED",
    verificationStatus: "UNVERIFIED",
    createdAt: "2026-07-19 13:58:30",
    capturedAt: null,
    customer: {
      name: "Rohan Verma",
      email: "rohan.verma@outlook.com",
      phone: "+91 93456 78901",
    },
    store: { id: "str_003", name: "Burgonomics Mansi Circle" },
    timeline: [
      {
        status: "created",
        title: "Payment Request Initialized",
        description: "UPI QR Code presented to user",
        time: "2026-07-19 13:57:40",
      },
      {
        status: "authorized",
        title: "Payment Authorized",
        description: "Awaiting automatic checkout auto-capture webhook",
        time: "2026-07-19 13:58:30",
      },
    ],
    metadata: {
      "VPA Address": "rohanv@okicici",
      "Gateway Channel": "GPay-UPI",
    },
    signature: "sha256_9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c",
    webhookEvents: [
      {
        id: "wh_4",
        event: "payment.authorized",
        status: "DELIVERED",
        time: "2026-07-19 13:58:32",
        payload: '{"event":"payment.authorized"}',
      },
    ],
    refunds: [],
    auditLogs: [],
  },
  {
    id: "pay_P4e0a1ea34e5",
    orderId: "BUR-8204",
    amountPaise: 29000,
    currency: "INR",
    gateway: "Razorpay UPI",
    gatewayPaymentId: "pay_OK8fA4js11a2",
    status: "CAPTURED",
    verificationStatus: "VERIFIED",
    createdAt: "2026-07-19 13:30:15",
    capturedAt: "2026-07-19 13:30:30",
    customer: {
      name: "Ananya Iyer",
      email: "ananya.iyer@gmail.com",
      phone: "+91 95678 90123",
    },
    store: { id: "str_004", name: "Burgonomics Science City" },
    timeline: [
      {
        status: "created",
        title: "Payment Request Initialized",
        description: "Checkout order BUR-8204 token generated",
        time: "2026-07-19 13:29:50",
      },
      {
        status: "authorized",
        title: "Payment Authorized",
        description: "UPI payload authorized via Paytm UPI",
        time: "2026-07-19 13:30:15",
      },
      {
        status: "captured",
        title: "Payment Captured",
        description: "Funds successfully moved to Escrow",
        time: "2026-07-19 13:30:30",
      },
    ],
    metadata: {
      "VPA Address": "ananyaiyer@okpaytm",
    },
    signature: "sha256_1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e",
    webhookEvents: [],
    refunds: [],
    auditLogs: [],
  },
  {
    id: "pay_P5e1b2ea12f6",
    orderId: "BUR-8205",
    amountPaise: 89000,
    currency: "INR",
    gateway: "Netbanking",
    gatewayPaymentId: "pay_OK8fG9js88x2",
    status: "CAPTURED",
    verificationStatus: "VERIFIED",
    createdAt: "2026-07-19 12:45:00",
    capturedAt: "2026-07-19 12:45:35",
    customer: {
      name: "Kabir Singh",
      email: "kabir.singh@gmail.com",
      phone: "+91 98989 89898",
    },
    store: { id: "str_005", name: "Burgonomics Gota" },
    timeline: [
      {
        status: "created",
        title: "Redirect Initialized",
        description: "Redirecting customer to SBI Corporate Banking portal",
        time: "2026-07-19 12:44:10",
      },
      {
        status: "authorized",
        title: "Bank Clearance Succeeded",
        description: "Secured bank authorization payload returned",
        time: "2026-07-19 12:45:00",
      },
      {
        status: "captured",
        title: "Netbanking Capture Complete",
        description: "Settlement scheduled via IMPS pool",
        time: "2026-07-19 12:45:35",
      },
    ],
    metadata: {
      "Bank Channel": "SBI Netbanking",
      "SBI Txn Reference": "SBI-68212192",
    },
    signature: "sha256_e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4",
    webhookEvents: [],
    refunds: [],
    auditLogs: [],
  },
  {
    id: "pay_P6e2c3ea89d0",
    orderId: "BUR-8206",
    amountPaise: 21500,
    currency: "INR",
    gateway: "Razorpay UPI",
    gatewayPaymentId: "pay_OK8fK3js11f5",
    status: "REFUNDED",
    verificationStatus: "VERIFIED",
    createdAt: "2026-07-19 11:20:00",
    capturedAt: "2026-07-19 11:20:12",
    customer: {
      name: "Neha Patel",
      email: "neha.patel@gmail.com",
      phone: "+91 94234 56789",
    },
    store: { id: "str_001", name: "Burgonomics Navrangpura" },
    timeline: [
      {
        status: "created",
        title: "Payment Initialized",
        description: "Fulfillment checkout token ready",
        time: "2026-07-19 11:19:15",
      },
      {
        status: "authorized",
        title: "Payment Authorized",
        description: "UPI checkout authorized",
        time: "2026-07-19 11:20:00",
      },
      {
        status: "captured",
        title: "Payment Captured",
        description: "Completed capture sequence",
        time: "2026-07-19 11:20:12",
      },
      {
        status: "refunded",
        title: "Refund Settled",
        description: "Released total amount via refund release console",
        time: "2026-07-19 11:25:30",
      },
    ],
    metadata: {
      "VPA Address": "nehapatel@okaxis",
      "Refund Reference": "rfnd_R1a89d0f1234",
    },
    signature: "sha256_f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5",
    webhookEvents: [
      {
        id: "wh_5",
        event: "payment.captured",
        status: "DELIVERED",
        time: "2026-07-19 11:20:13",
        payload: '{"event":"payment.captured"}',
      },
      {
        id: "wh_6",
        event: "refund.processed",
        status: "DELIVERED",
        time: "2026-07-19 11:25:35",
        payload: '{"event":"refund.processed"}',
      },
    ],
    refunds: [
      {
        id: "rfnd_R1a89d0f1234",
        amountPaise: 21500,
        reason: "Duplicate payment made at checkout",
        status: "COMPLETED",
        createdAt: "2026-07-19 11:25:00",
      },
    ],
    auditLogs: [
      {
        id: "aud_2",
        admin: "Jesal Pande (pandejesal@gmail.com)",
        action: "INITIATE_REFUND",
        timestamp: "2026-07-19 11:24:55",
        oldValue: "CAPTURED",
        newValue: "REFUNDED",
        ipAddress: "157.34.82.112",
        device: "Chrome 126 / macOS",
      },
    ],
  },
  {
    id: "pay_P7e3d4ea22f1",
    orderId: "BUR-8207",
    amountPaise: 35000,
    currency: "INR",
    gateway: "Razorpay Card",
    gatewayPaymentId: "pay_OK8fR1js77x4",
    status: "FAILED",
    verificationStatus: "FAILED",
    createdAt: "2026-07-19 10:45:12",
    capturedAt: null,
    customer: {
      name: "Saurabh Mishra",
      email: "saurabh.mishra@gmail.com",
      phone: "+91 90909 09090",
    },
    store: { id: "str_002", name: "Burgonomics Nehrunagar" },
    timeline: [
      {
        status: "created",
        title: "Payment Initialized",
        description: "Card details input stage",
        time: "2026-07-19 10:44:30",
      },
      {
        status: "failed",
        title: "Authentication Failed",
        description: "3D Secure authentication failed / Timeout by issuer bank",
        time: "2026-07-19 10:45:12",
      },
    ],
    metadata: {
      "Error Code": "BAD_REQUEST_AUTHENTICATION_FAILED",
      "Error Desc": "Issuer bank failed to authenticate the 3D-Secure credentials.",
    },
    signature: "",
    webhookEvents: [
      {
        id: "wh_7",
        event: "payment.failed",
        status: "DELIVERED",
        time: "2026-07-19 10:45:15",
        payload: '{"event":"payment.failed","error":{"code":"BAD_REQUEST_AUTHENTICATION_FAILED"}}',
      },
    ],
    refunds: [],
    auditLogs: [],
  },
  {
    id: "pay_P8x9y0z1a2b3",
    orderId: "BUR-8208",
    amountPaise: 38000,
    currency: "INR",
    gateway: "Razorpay UPI",
    gatewayPaymentId: "pay_OK8fX9js22m3",
    status: "CAPTURED",
    verificationStatus: "VERIFIED",
    createdAt: "2026-07-19 10:10:00",
    capturedAt: "2026-07-19 10:10:14",
    customer: {
      name: "Amit Shah",
      email: "amit.shah@gmail.com",
      phone: "+91 91234 56789",
    },
    store: { id: "str_003", name: "Burgonomics Mansi Circle" },
    timeline: [
      {
        status: "created",
        title: "Payment Request Initialized",
        description: "Token generation active",
        time: "2026-07-19 10:09:40",
      },
      {
        status: "authorized",
        title: "Payment Authorized",
        description: "Captured successfully on callback",
        time: "2026-07-19 10:10:00",
      },
    ],
    metadata: {
      "VPA Address": "amitshah@okaxis",
      "Flagged Duplicate": "TRUE",
    },
    signature: "sha256_duplicate_test_signature_xyz_12345",
    webhookEvents: [],
    refunds: [],
    auditLogs: [],
  },
  {
    id: "pay_P9f8g7h6i5j4",
    orderId: "BUR-8192",
    amountPaise: 34000,
    currency: "INR",
    gateway: "Razorpay UPI",
    gatewayPaymentId: "pay_OK8gY1js44d9",
    status: "PARTIALLY_REFUNDED",
    verificationStatus: "VERIFIED",
    createdAt: "2026-07-19 10:05:00",
    capturedAt: "2026-07-19 10:05:15",
    customer: {
      name: "Amit Verma",
      email: "amit.verma@gmail.com",
      phone: "+91 98111 22233",
    },
    store: { id: "str_004", name: "Burgonomics Science City" },
    timeline: [
      {
        status: "created",
        title: "Payment Initialized",
        description: "Session started",
        time: "2026-07-19 10:04:15",
      },
      {
        status: "authorized",
        title: "Payment Authorized",
        description: "UPI Handshake verified",
        time: "2026-07-19 10:05:00",
      },
      {
        status: "captured",
        title: "Payment Captured",
        description: "Completed capture sequence",
        time: "2026-07-19 10:05:15",
      },
      {
        status: "refunded",
        title: "Partial Refund Initiated",
        description: "₹150.00 partial refund processed",
        time: "2026-07-19 10:10:20",
      },
    ],
    metadata: {
      "VPA Address": "amitverma@okaxis",
      "Refund Status": "Partially Refunded (₹150.00)",
    },
    signature: "sha256_partially_refunded_signature_xyz",
    webhookEvents: [],
    refunds: [
      {
        id: "rfnd_R2b9e1e2c3d4",
        amountPaise: 15000,
        reason: "Customer cancelled part of order before kitchen prep",
        status: "COMPLETED",
        createdAt: "2026-07-19 10:10:00",
      },
    ],
    auditLogs: [
      {
        id: "aud_3",
        admin: "Jesal Pande (pandejesal@gmail.com)",
        action: "INITIATE_PARTIAL_REFUND",
        timestamp: "2026-07-19 10:10:00",
        oldValue: "CAPTURED",
        newValue: "PARTIALLY_REFUNDED",
        ipAddress: "157.34.82.112",
        device: "Chrome 126 / macOS",
      },
    ],
  },
  {
    id: "pay_P10m9n8o7p6q",
    orderId: "BUR-8181",
    amountPaise: 19000,
    currency: "INR",
    gateway: "Razorpay Card",
    gatewayPaymentId: "pay_OK8hZ9js99z8",
    status: "CAPTURED",
    verificationStatus: "VERIFIED",
    createdAt: "2026-07-18 19:38:00",
    capturedAt: "2026-07-18 19:38:40",
    customer: {
      name: "Sanjay Dutt",
      email: "sanjay.dutt@gmail.com",
      phone: "+91 98333 44455",
    },
    store: { id: "str_001", name: "Burgonomics Navrangpura" },
    timeline: [
      {
        status: "created",
        title: "Payment Initialized",
        description: "Card details page",
        time: "2026-07-18 19:37:10",
      },
      {
        status: "authorized",
        title: "Payment Authorized",
        description: "Visa Secure checkout success",
        time: "2026-07-18 19:38:00",
      },
      {
        status: "captured",
        title: "Payment Captured",
        description: "Capture sequence completed",
        time: "2026-07-18 19:38:40",
      },
    ],
    metadata: {
      "Card Network": "Mastercard Debit (ICICI Bank)",
    },
    signature: "sha256_sanjay_dutt_test_signature",
    webhookEvents: [],
    refunds: [],
    auditLogs: [],
  },
  {
    id: "pay_P11f9g8h7i6j",
    orderId: "BUR-8209",
    amountPaise: 45000,
    currency: "INR",
    gateway: "Razorpay UPI",
    gatewayPaymentId: "pay_OK8iA1js11c4",
    status: "DISPUTED",
    verificationStatus: "VERIFIED",
    createdAt: "2026-07-19 08:30:00",
    capturedAt: "2026-07-19 08:30:15",
    customer: {
      name: "Vikram Rathore",
      email: "vikram.r@gmail.com",
      phone: "+91 97777 88888",
    },
    store: { id: "str_001", name: "Burgonomics Navrangpura" },
    timeline: [
      {
        status: "created",
        title: "Payment Request Initialized",
        description: "UPI Handshake generated",
        time: "2026-07-19 08:29:10",
      },
      {
        status: "authorized",
        title: "Payment Authorized",
        description: "Completed authorization",
        time: "2026-07-19 08:30:00",
      },
      {
        status: "disputed",
        title: "Dispute Flagged",
        description: "Customer raised chargeback claims for non-delivery",
        time: "2026-07-19 09:12:00",
      },
    ],
    metadata: {
      "Dispute Reason": "Product not received / Non-delivery escalation",
      "Dispute ID": "disp_V3b7d8fa82b1",
    },
    signature: "sha256_disputed_test_signature",
    webhookEvents: [
      {
        id: "wh_8",
        event: "payment.disputed",
        status: "DELIVERED",
        time: "2026-07-19 09:12:05",
        payload:
          '{"event":"payment.disputed","payload":{"dispute":{"id":"disp_V3b7d8fa82b1","reason":"product_not_received"}}}',
      },
    ],
    refunds: [],
    auditLogs: [
      {
        id: "aud_4",
        admin: "System / Razorpay Callback",
        action: "CHARGEBACK_DISPUTED",
        timestamp: "2026-07-19 09:12:05",
        oldValue: "CAPTURED",
        newValue: "DISPUTED",
        ipAddress: "13.233.14.82",
        device: "Automated Webhook Integration",
      },
    ],
  },
];

const INITIAL_REFUNDS: RefundDetails[] = [
  {
    id: "rfnd_R1a89d0f1234",
    paymentId: "pay_P6e2c3ea89d0",
    orderId: "BUR-8206",
    customerName: "Neha Patel",
    storeName: "Burgonomics Navrangpura",
    amountPaise: 21500,
    reason: "Duplicate payment made at checkout",
    status: "COMPLETED",
    processedBy: "Jesal Pande (pandejesal@gmail.com)",
    gatewayStatus: "processed",
    createdAt: "2026-07-19 11:25:00",
    completedAt: "2026-07-19 11:25:30",
  },
  {
    id: "rfnd_R2b9e1e2c3d4",
    paymentId: "pay_P9f8g7h6i5j4",
    orderId: "BUR-8192",
    customerName: "Amit Verma",
    storeName: "Burgonomics Science City",
    amountPaise: 15000,
    reason: "Customer cancelled part of order before kitchen prep",
    status: "COMPLETED",
    processedBy: "Jesal Pande (pandejesal@gmail.com)",
    gatewayStatus: "processed",
    createdAt: "2026-07-19 10:10:00",
    completedAt: "2026-07-19 10:10:20",
  },
  {
    id: "rfnd_R3c0f2f3d4e5",
    paymentId: "pay_P10m9n8o7p6q",
    orderId: "BUR-8181",
    customerName: "Sanjay Dutt",
    storeName: "Burgonomics Navrangpura",
    amountPaise: 19000,
    reason: "Out of stock wrap ingredients",
    status: "COMPLETED",
    processedBy: "System Automated Rule",
    gatewayStatus: "processed",
    createdAt: "2026-07-18 19:40:00",
    completedAt: "2026-07-18 19:40:35",
  },
  {
    id: "rfnd_R4d1f3f4e5f6",
    paymentId: "pay_P3d9f0ea56d9",
    orderId: "BUR-8203",
    customerName: "Rohan Verma",
    storeName: "Burgonomics Mansi Circle",
    amountPaise: 31000,
    reason: "POS sync timeout, cashier manually cancelled",
    status: "PENDING",
    processedBy: "Store Manager (Mansi Circle)",
    gatewayStatus: "pending",
    createdAt: "2026-07-19 14:00:10",
    completedAt: null,
  },
];

const INITIAL_DISCREPANCIES: DiscrepancyDetails[] = [
  {
    id: "rec_1",
    orderId: "BUR-8210",
    paymentId: "pay_P8x9y0z1a2b4",
    type: "AMOUNT_MISMATCH",
    reason:
      "Razorpay captured amount is ₹450.00, but internal POS checkout order amount is ₹420.00.",
    internalAmountPaise: 42000,
    gatewayAmountPaise: 45000,
    status: "UNRESOLVED",
  },
  {
    id: "rec_2",
    orderId: "BUR-8211",
    paymentId: "pay_P9x0y1z2a3b5",
    type: "DUPLICATE_PAYMENT",
    reason: "Customer charged twice within 10 seconds. Double webhook authorization triggered.",
    internalAmountPaise: 35000,
    gatewayAmountPaise: 35000,
    status: "UNRESOLVED",
  },
  {
    id: "rec_3",
    orderId: "BUR-8212",
    paymentId: "pay_P10x1y2z3a4b6",
    type: "FAILED_CAPTURE",
    reason: "Gateway status authorized, but capture execution timeout triggered after 120 minutes.",
    internalAmountPaise: 29000,
    gatewayAmountPaise: 29000,
    status: "UNRESOLVED",
  },
  {
    id: "rec_4",
    orderId: "BUR-8213",
    paymentId: "pay_P11x2y3z4a5b7",
    type: "MISSING_PAYMENT",
    reason:
      "Order marked delivered, but transaction signature verification failed on final handshake.",
    internalAmountPaise: 51000,
    gatewayAmountPaise: 0,
    status: "UNRESOLVED",
  },
];

const INITIAL_DUPLICATES: DuplicateAttempt[] = [
  {
    id: "dup_1",
    orderId: "BUR-8208",
    customer: { name: "Amit Shah", phone: "+91 91234 56789" },
    gateway: "Razorpay GPay-UPI",
    timeDiff: "14 seconds",
    amountPaise: 38000,
    probability: "98% Match",
    status: "UNRESOLVED",
  },
  {
    id: "dup_2",
    orderId: "BUR-8202",
    customer: { name: "Priya Sharma", phone: "+91 91234 56789" },
    gateway: "Razorpay Visa Credit",
    timeDiff: "28 seconds",
    amountPaise: 51000,
    probability: "91% Match",
    status: "UNRESOLVED",
  },
];

// Persistent state class in-memory
class PaymentDataStorage {
  private txns = [...INITIAL_TRANSACTIONS];
  private refunds = [...INITIAL_REFUNDS];
  private discrepancies = [...INITIAL_DISCREPANCIES];
  private duplicates = [...INITIAL_DUPLICATES];
  private listeners: Array<() => void> = [];

  private notify() {
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getTransactions() {
    return this.txns;
  }

  getTransactionById(id: string) {
    return this.txns.find((t) => t.id === id || t.orderId === id || t.gatewayPaymentId === id);
  }

  getRefunds() {
    return this.refunds;
  }

  getDiscrepancies() {
    return this.discrepancies;
  }

  getDuplicates() {
    return this.duplicates;
  }

  // State manipulation methods
  retryVerification(paymentId: string) {
    const txn = this.txns.find((t) => t.id === paymentId);
    if (!txn) {
      toast.error("Transaction not found.");
      return false;
    }

    txn.verificationStatus = "VERIFIED";
    txn.timeline.push({
      status: "authorized",
      title: "Signature Verified Manually",
      description: "Admin signature sync verification completed successfully.",
      time: new Date().toISOString().slice(0, 19).replace("T", " "),
    });
    txn.auditLogs.push({
      id: `aud_${Date.now()}`,
      admin: "Jesal Pande (pandejesal@gmail.com)",
      action: "MANUAL_SIGN_VERIFY",
      timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
      oldValue: "UNVERIFIED",
      newValue: "VERIFIED",
      ipAddress: "157.34.82.112",
      device: "Chrome 126 / macOS",
    });

    toast.success(`Verification re-attempted and verified for ${paymentId}`);
    this.notify();
    return true;
  }

  issueRefund(paymentId: string, amountPaise: number, reason: string, isPartial = false) {
    const txn = this.txns.find((t) => t.id === paymentId);
    if (!txn) {
      toast.error("Transaction not found.");
      return false;
    }

    const refundId = `rfnd_R${generateSecureId(12)}`;

    // Add to transaction refunds list
    txn.refunds.push({
      id: refundId,
      amountPaise,
      reason,
      status: "COMPLETED",
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    });

    // Update transaction status
    const previousStatus = txn.status;
    txn.status = isPartial ? "PARTIALLY_REFUNDED" : "REFUNDED";

    txn.timeline.push({
      status: "refunded",
      title: isPartial ? "Partial Refund Dispatched" : "Full Refund Settled",
      description: `₹${(amountPaise / 100).toFixed(2)} refunded. Reason: ${reason}`,
      time: new Date().toISOString().slice(0, 19).replace("T", " "),
    });

    txn.auditLogs.push({
      id: `aud_${Date.now()}`,
      admin: "Jesal Pande (pandejesal@gmail.com)",
      action: isPartial ? "INITIATE_PARTIAL_REFUND" : "INITIATE_REFUND",
      timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
      oldValue: previousStatus,
      newValue: txn.status,
      ipAddress: "157.34.82.112",
      device: "Chrome 126 / macOS",
    });

    // Add to global refunds panel directory
    this.refunds.unshift({
      id: refundId,
      paymentId,
      orderId: txn.orderId,
      customerName: txn.customer.name,
      storeName: txn.store.name,
      amountPaise,
      reason,
      status: "COMPLETED",
      processedBy: "Jesal Pande (pandejesal@gmail.com)",
      gatewayStatus: "processed",
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      completedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    });

    toast.success(`Refund of ₹${(amountPaise / 100).toFixed(2)} completed successfully!`);
    this.notify();
    return true;
  }

  approveRefundRelease(refundId: string) {
    const r = this.refunds.find((ref) => ref.id === refundId);
    if (!r) return false;

    r.status = "COMPLETED";
    r.gatewayStatus = "processed";
    r.completedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    r.processedBy = "Jesal Pande (pandejesal@gmail.com)";

    // Update associated transaction
    const txn = this.txns.find((t) => t.id === r.paymentId);
    if (txn) {
      txn.status = "REFUNDED";
      const trf = txn.refunds.find((rf) => rf.id === refundId);
      if (trf) trf.status = "COMPLETED";

      txn.timeline.push({
        status: "refunded",
        title: "Refund Approved by Manager",
        description: `₹${(r.amountPaise / 100).toFixed(2)} settled. Reason: ${r.reason}`,
        time: new Date().toISOString().slice(0, 19).replace("T", " "),
      });
    }

    toast.success(`Refund payout release authorized successfully.`);
    this.notify();
    return true;
  }

  rejectRefundRelease(refundId: string, reason: string) {
    const r = this.refunds.find((ref) => ref.id === refundId);
    if (!r) return false;

    r.status = "FAILED";
    r.gatewayStatus = "rejected";
    r.processedBy = `Rejected: ${reason}`;

    const txn = this.txns.find((t) => t.id === r.paymentId);
    if (txn) {
      txn.status = "CAPTURED";
      const trf = txn.refunds.find((rf) => rf.id === refundId);
      if (trf) trf.status = "FAILED";

      txn.timeline.push({
        status: "captured",
        title: "Refund Request Rejected",
        description: `Rejected. Reason: ${reason}`,
        time: new Date().toISOString().slice(0, 19).replace("T", " "),
      });
    }

    toast.info(`Refund request rejected.`);
    this.notify();
    return true;
  }

  retryRefundRelease(refundId: string) {
    const r = this.refunds.find((ref) => ref.id === refundId);
    if (!r) return false;

    r.status = "PENDING";
    r.gatewayStatus = "re-queued";

    toast.success(`Refund process re-queued in Razorpay payouts engine.`);
    this.notify();
    return true;
  }

  resolveDiscrepancy(id: string, action: "resolve" | "retry") {
    const d = this.discrepancies.find((disc) => disc.id === id);
    if (!d) return false;

    if (action === "resolve") {
      d.status = "RESOLVED";
      d.resolvedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
      d.resolvedBy = "Jesal Pande (pandejesal@gmail.com)";
      toast.success(`Discrepancy resolved and marked settled.`);
    } else {
      toast.info(`Initiating reconciliation recheck on Razorpay backend...`);
      setTimeout(() => {
        toast.success(`Verification logs synced. No further gateway drift detected.`);
      }, 1000);
    }

    this.notify();
    return true;
  }

  resolveDuplicate(orderId: string, action: "merge" | "ignore" | "investigate") {
    const dup = this.duplicates.find((d) => d.orderId === orderId);
    if (!dup) return false;

    if (action === "merge") {
      dup.status = "MERGED";
      toast.success(`Duplicate transactions merged successfully.`);
    } else if (action === "ignore") {
      dup.status = "IGNORED";
      toast.success(`Duplicate alert ignored.`);
    } else {
      dup.status = "INVESTIGATING";
      toast.info(`Flagged duplicate transaction set in investigation mode.`);
    }

    this.notify();
    return true;
  }
}

export const paymentStorage = new PaymentDataStorage();
export type { TransactionDetails as PaymentTransaction };
export type { RefundDetails as RefundTransaction };
