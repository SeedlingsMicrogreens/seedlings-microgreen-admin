import type { MenuNode } from "@adminlte/react";

export const menuItems: MenuNode[] = [
  { type: "item", text: "Dashboard", href: "/", icon: "bi-speedometer2" },

  {
    type: "group",
    text: "Sales & Customers",
    icon: "bi-shop",
    children: [
      { type: "item", text: "Customers", href: "/customers", icon: "bi-people" },
      { type: "item", text: "Orders", href: "/orders", icon: "bi-cart3" },
      { type: "item", text: "Subscriptions", href: "/subscriptions", icon: "bi-arrow-repeat" },
      { type: "item", text: "Enquiries", href: "/customer-contact-required", icon: "bi-person-lines-fill" },
    ],
  },

  {
    type: "group",
    text: "Production",
    icon: "bi-moisture",
    children: [
      { type: "item", text: "Growing Batches", href: "/growing-batches", icon: "bi-moisture" },
      { type: "item", text: "Inventory", href: "/inventory", icon: "bi-boxes" },
      { type: "item", text: "Production Forecast", href: "/forecasting", icon: "bi-graph-up" },
    ],
  },

  {
    type: "group",
    text: "Delivery & Fulfilment",
    icon: "bi-truck",
    children: [
      { type: "item", text: "Packing & Fulfilment", href: "/fulfilment", icon: "bi-box-seam" },
      { type: "item", text: "Delivery Operations", href: "/delivery", icon: "bi-truck" },
    ],
  },

  {
    type: "group",
    text: "Website CMS",
    icon: "bi-layout-text-window",
    children: [
      { type: "item", text: "Homepage Content", href: "/cms/homepage", icon: "bi-house" },
      { type: "item", text: "Website Pages", href: "/cms/pages", icon: "bi-file-earmark-text" },
      { type: "item", text: "Hero Slider", href: "/cms/banners", icon: "bi-images" },
      { type: "item", text: "Our Journey", href: "/cms/journey", icon: "bi-signpost-2" },
      { type: "item", text: "Trust Points", href: "/cms/trust-points", icon: "bi-shield-check" },
      { type: "item", text: "FAQ", href: "/cms/faq", icon: "bi-question-circle" },
      { type: "item", text: "Testimonials", href: "/cms/testimonials", icon: "bi-chat-quote" },
      { type: "item", text: "Blogs", href: "/cms/blogs", icon: "bi-journal-text" },
      { type: "item", text: "Navigation", href: "/cms/navigation", icon: "bi-list" },
      { type: "item", text: "Website Settings", href: "/cms/settings", icon: "bi-gear" },
    ],
  },

  {
    type: "group",
    text: "Reports & Analytics",
    icon: "bi-bar-chart",
    children: [
      { type: "item", text: "Business Dashboard", href: "/reports", icon: "bi-bar-chart" },
      { type: "item", text: "Production Analytics", href: "/reports/production", icon: "bi-graph-up-arrow" },
      { type: "item", text: "Customer Growth", href: "/reports/customer-growth", icon: "bi-person-up" },
    ],
  },

  { type: "item", text: "Notifications", href: "/notifications", icon: "bi-bell" },

  {
    type: "group",
    text: "Masters",
    icon: "bi-shield-lock",
    children: [
      { type: "item", text: "Products", href: "/products", icon: "bi-box-seam" },
      { type: "item", text: "Salable Products", href: "/sales-products", icon: "bi-bag-check" },
      { type: "item", text: "Subscription Plans", href: "/subscription-masters", icon: "bi-arrow-repeat" },
      { type: "item", text: "Delivery Charges", href: "/delivery-masters", icon: "bi-truck" },
      { type: "item", text: "Pincode Master", href: "/geolocations", icon: "bi-geo-alt" },
      { type: "item", text: "Rack Locations", href: "/locations", icon: "bi-pin-map" },
      { type: "item", text: "Admin Users", href: "/admin-users", icon: "bi-people" },
      { type: "item", text: "Audit Log", href: "/audit-log", icon: "bi-journal-text" },
      { type: "item", text: "System Settings", href: "/settings", icon: "bi-gear" },
    ],
  },
];
