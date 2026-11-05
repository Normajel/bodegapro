import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadMyCompanies } from "@/lib/multiempresa/company-api";
import { PRODUCTION_AREAS, PRODUCTION_PLANNING_WRITES_ENABLED, canPlanProduction, validatePlanning, type PlanningDraft } from "@/lib/multiempresa/production-planning";

type Unit = { id: string; company_id: string; sales_note_id: string; unit_code_snapshot: string; module_index: number; status: string };
export function TenantProductionPlanner({ companyId, units }: { companyId: string; units: Unit[] }) {
  const [selected, setSelected] = useState("");
  const [area, setArea] = useState<(typeof PRODUCTION_AREAS)[number]>("ESTRUCTURA");
  const [priority, setPriority] = useState<PlanningDraft["priority"]>("NORMAL");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState<PlanningDraft | null>(null);
