from __future__ import annotations

import math
from dataclasses import dataclass, asdict
from typing import Any, Dict, Optional


class CalculationError(ValueError):
    """Raised when the calculator receives invalid business data."""


def _money(value: float) -> float:
    return round(float(value), 2)


def _number(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


@dataclass(frozen=True)
class CalculatorInput:
    business_name: str
    segment: str
    revenue_model: str
    ad_budget: float
    service_cost: float
    extra_costs: float
    average_ticket: float
    gross_margin_pct: float
    close_rate_pct: float
    retention_months: float = 1.0
    cpl: Optional[float] = None

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "CalculatorInput":
        def text(name: str, default: str = "") -> str:
            return str(payload.get(name, default)).strip()[:120]

        def number(name: str, default: float = 0.0) -> float:
            raw = payload.get(name, default)
            if raw in (None, ""):
                return float(default)
            try:
                return float(raw)
            except (TypeError, ValueError) as exc:
                raise CalculationError(f"O campo '{name}' precisa ser numérico.") from exc

        revenue_model = text("revenue_model", "single")
        if revenue_model not in {"single", "recurring"}:
            raise CalculationError("Modelo de receita inválido.")

        cpl_raw = payload.get("cpl")
        cpl = None if cpl_raw in (None, "", 0, "0") else number("cpl")

        item = cls(
            business_name=text("business_name", "Seu negócio"),
            segment=text("segment", "Não informado"),
            revenue_model=revenue_model,
            ad_budget=number("ad_budget"),
            service_cost=number("service_cost"),
            extra_costs=number("extra_costs"),
            average_ticket=number("average_ticket"),
            gross_margin_pct=number("gross_margin_pct"),
            close_rate_pct=number("close_rate_pct"),
            retention_months=number("retention_months", 1.0),
            cpl=cpl,
        )
        item.validate()
        return item

    def validate(self) -> None:
        if self.ad_budget < 0 or self.service_cost < 0 or self.extra_costs < 0:
            raise CalculationError("Os investimentos não podem ser negativos.")
        if self.ad_budget + self.service_cost + self.extra_costs <= 0:
            raise CalculationError("Informe algum valor de investimento.")
        if self.average_ticket <= 0:
            raise CalculationError("O ticket médio precisa ser maior que zero.")
        if not 0 < self.gross_margin_pct <= 100:
            raise CalculationError("A margem precisa estar entre 0,01% e 100%.")
        if not 0 < self.close_rate_pct <= 100:
            raise CalculationError("A conversão precisa estar entre 0,01% e 100%.")
        if self.revenue_model == "recurring" and self.retention_months < 1:
            raise CalculationError("A permanência média precisa ser de pelo menos 1 mês.")
        if self.cpl is not None and self.cpl <= 0:
            raise CalculationError("O custo por lead precisa ser maior que zero.")


def _scenario(
    *,
    name: str,
    ad_budget: float,
    total_investment: float,
    customer_revenue: float,
    margin_rate: float,
    cpl: float,
    close_rate: float,
) -> Dict[str, Any]:
    leads = ad_budget / cpl if cpl > 0 else 0
    customers = leads * close_rate
    revenue = customers * customer_revenue
    contribution = revenue * margin_rate
    net_return = contribution - total_investment
    roi = (net_return / total_investment * 100) if total_investment > 0 else 0
    roas = (revenue / ad_budget) if ad_budget > 0 else None
    cac_total = (total_investment / customers) if customers > 0 else None

    return {
        "name": name,
        "cpl": _money(cpl),
        "close_rate_pct": _number(close_rate * 100, 1),
        "leads": _number(leads, 1),
        "customers": _number(customers, 1),
        "revenue": _money(revenue),
        "contribution": _money(contribution),
        "net_return": _money(net_return),
        "roi_pct": _number(roi, 1),
        "roas": _number(roas, 2) if roas is not None else None,
        "cac_total": _money(cac_total) if cac_total is not None else None,
        "status": "positive" if net_return > 0 else "neutral" if abs(net_return) < 0.01 else "negative",
    }


def calculate_roi(data: CalculatorInput) -> Dict[str, Any]:
    margin_rate = data.gross_margin_pct / 100
    close_rate = data.close_rate_pct / 100
    retention = data.retention_months if data.revenue_model == "recurring" else 1.0

    total_investment = data.ad_budget + data.service_cost + data.extra_costs
    customer_revenue = data.average_ticket * retention
    customer_contribution = customer_revenue * margin_rate

    break_even_customers_exact = total_investment / customer_contribution
    break_even_customers = math.ceil(break_even_customers_exact)
    required_leads_exact = break_even_customers_exact / close_rate
    required_leads = math.ceil(required_leads_exact)
    exact_break_even_revenue = total_investment / margin_rate
    rounded_break_even_revenue = break_even_customers * customer_revenue

    # Limite de CPL de mídia para que a contribuição esperada cubra todo o investimento.
    max_media_cpl = (
        data.ad_budget / required_leads_exact
        if data.ad_budget > 0 and required_leads_exact > 0
        else 0
    )
    economic_value_per_lead = customer_contribution * close_rate
    max_total_cac = customer_contribution

    result: Dict[str, Any] = {
        "input": asdict(data),
        "mode": "forecast" if data.cpl is not None and data.ad_budget > 0 else "break_even",
        "metrics": {
            "total_investment": _money(total_investment),
            "customer_revenue": _money(customer_revenue),
            "customer_contribution": _money(customer_contribution),
            "break_even_customers": break_even_customers,
            "break_even_customers_exact": _number(break_even_customers_exact, 2),
            "required_leads": required_leads,
            "required_leads_exact": _number(required_leads_exact, 2),
            "exact_break_even_revenue": _money(exact_break_even_revenue),
            "rounded_break_even_revenue": _money(rounded_break_even_revenue),
            "max_media_cpl": _money(max_media_cpl),
            "economic_value_per_lead": _money(economic_value_per_lead),
            "max_total_cac": _money(max_total_cac),
            "retention_months": _number(retention, 1),
        },
        "scenarios": [],
    }

    if data.cpl is not None and data.ad_budget > 0:
        scenarios = [
            _scenario(
                name="Conservador",
                ad_budget=data.ad_budget,
                total_investment=total_investment,
                customer_revenue=customer_revenue,
                margin_rate=margin_rate,
                cpl=data.cpl * 1.25,
                close_rate=max(close_rate * 0.80, 0.001),
            ),
            _scenario(
                name="Provável",
                ad_budget=data.ad_budget,
                total_investment=total_investment,
                customer_revenue=customer_revenue,
                margin_rate=margin_rate,
                cpl=data.cpl,
                close_rate=close_rate,
            ),
            _scenario(
                name="Otimista",
                ad_budget=data.ad_budget,
                total_investment=total_investment,
                customer_revenue=customer_revenue,
                margin_rate=margin_rate,
                cpl=max(data.cpl * 0.80, 0.01),
                close_rate=min(close_rate * 1.20, 1.0),
            ),
        ]
        result["scenarios"] = scenarios
        result["metrics"]["probable"] = scenarios[1]

        if data.revenue_model == "recurring":
            probable_customers = scenarios[1]["customers"]
            monthly_contribution = probable_customers * data.average_ticket * margin_rate
            payback_months = total_investment / monthly_contribution if monthly_contribution > 0 else None
            result["metrics"]["estimated_payback_months"] = (
                _number(payback_months, 1) if payback_months is not None else None
            )

    return result
