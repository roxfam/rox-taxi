import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("admin_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

export const STATUS_STEPS = [
  { key: "confirmed", label: "Confirmed" },
  { key: "driver_assigned", label: "Driver Assigned" },
  { key: "en_route", label: "En Route" },
  { key: "arrived", label: "Arrived" },
  { key: "completed", label: "Completed" },
];

export const STATUS_INDEX = (s) => STATUS_STEPS.findIndex((x) => x.key === s);
