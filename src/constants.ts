// Base URLs for the EcourtsIndia Partner API
export const API_BASE_URL = "https://webapi.ecourtsindia.com/api/partner";
export const COURT_STRUCTURE_BASE_URL = "https://webapi.ecourtsindia.com/api/CauseList/court-structure";

// Safety limit to prevent overwhelming LLM context windows
export const CHARACTER_LIMIT = 25000;

// Default pagination values
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_CAUSELIST_LIMIT = 50;
export const MAX_CAUSELIST_LIMIT = 100;
