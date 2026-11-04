/**
 * Runs in <head> before first paint so a collapsed sidebar never flashes open.
 * Kept free of React imports because the root layout is a Server Component.
 */
export const SIDEBAR_STORAGE_KEY = "steward:sidebar-collapsed";
export const SIDEBAR_ATTRIBUTE = "data-sidebar";

export const SIDEBAR_INIT_SCRIPT = `try{if(localStorage.getItem("${SIDEBAR_STORAGE_KEY}")==="true")document.documentElement.setAttribute("${SIDEBAR_ATTRIBUTE}","collapsed")}catch(e){}`;
