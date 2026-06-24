from calculations import CalculatorInput, calculate_roi


def test_single_sale_break_even():
    data = CalculatorInput(
        business_name="Teste",
        segment="Serviços",
        revenue_model="single",
        ad_budget=2000,
        service_cost=1000,
        extra_costs=0,
        average_ticket=800,
        gross_margin_pct=60,
        close_rate_pct=20,
        cpl=30,
    )
    result = calculate_roi(data)
    assert result["metrics"]["total_investment"] == 3000
    assert result["metrics"]["break_even_customers"] == 7
    assert result["metrics"]["required_leads"] == 32
    assert result["scenarios"][1]["roi_pct"] > 0


def test_recurring_uses_retention():
    data = CalculatorInput(
        business_name="Academia",
        segment="Fitness",
        revenue_model="recurring",
        ad_budget=1500,
        service_cost=750,
        extra_costs=0,
        average_ticket=150,
        gross_margin_pct=50,
        close_rate_pct=20,
        retention_months=10,
        cpl=25,
    )
    result = calculate_roi(data)
    assert result["metrics"]["customer_revenue"] == 1500
    assert result["metrics"]["break_even_customers"] == 3
    assert result["metrics"]["estimated_payback_months"] is not None
