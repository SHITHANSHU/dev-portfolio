import { buildSearchIndex } from "@/lib/search/index-build";

export const dynamic = "force-static";
export const GET = () => Response.json(buildSearchIndex());
