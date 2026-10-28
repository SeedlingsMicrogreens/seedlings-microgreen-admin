export type CmsStatus = "draft" | "published" | "archived";
export type CmsPage = { id:string; title:string; slug:string; excerpt:string; content:string; status:CmsStatus; seoTitle:string; seoDescription:string; sortOrder:number; updatedAt?:unknown };
export type Faq = { id:string; question:string; answer:string; status:CmsStatus; sortOrder:number; updatedAt?:unknown };
export type Testimonial = { id:string; customerName:string; content:string; rating:number; status:CmsStatus; sortOrder:number; updatedAt?:unknown };
export type BlogPost = { id:string; title:string; slug:string; excerpt:string; content:string; coverImageUrl:string; videoId:string; authorName:string; publishedAt:string; status:CmsStatus; seoTitle:string; seoDescription:string; updatedAt?:unknown };
export type CmsBanner = { id:string; title:string; subtitle:string; imageUrl:string; buttonText:string; buttonUrl:string; status:CmsStatus; sortOrder:number; updatedAt?:unknown };
export type CmsNavigationItem = { id:string; label:string; url:string; location:"header"|"footer"; sortOrder:number; status:CmsStatus };
export type CmsSiteSettings = { id:string; siteName:string; tagline:string; contactEmail:string; contactPhone:string; address:string; footerText:string; logoUrl:string; faviconUrl:string; seoTitle:string; seoDescription:string };
