// Stripe product and price IDs for ROTOVIDE
export const STRIPE_PRODUCTS = {
  pro_monthly: {
    product_id: "prod_U4upMj30q5llOR",
    price_id: "price_1T6l0E2Q7kGVknGdPI95X953",
    label: "Pro Monthly",
    price: "$24.99",
    period: "/mo",
    credits: 150,
  },
  pro_annual: {
    product_id: "prod_U4uqRjsujd8x5e",
    price_id: "price_1T6l0Y2Q7kGVknGd8mXXVpiL",
    label: "Pro Annual",
    price: "$179",
    period: "/yr",
    credits: 150,
    savings: "Save 40%",
  },
} as const;

export const STRIPE_TOPUPS = [
  {
    product_id: "prod_U4uqhOhz775U4i",
    price_id: "price_1T6l0s2Q7kGVknGdDPzvHLLz",
    credits: 60,
    price: "$9",
    popular: false,
  },
  {
    product_id: "prod_U4uqDmNEo6KbuK",
    price_id: "price_1T6l1D2Q7kGVknGdaRx3T2qx",
    credits: 120,
    price: "$16",
    popular: true,
  },
  {
    product_id: "prod_U4urXdq4C0ivXA",
    price_id: "price_1T6l2F2Q7kGVknGdwQfnct7C",
    credits: 250,
    price: "$29",
    popular: false,
  },
] as const;
