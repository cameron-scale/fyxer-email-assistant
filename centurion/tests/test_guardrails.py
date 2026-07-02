from guardrails import GuardrailEngine, Action


def eng():
    return GuardrailEngine()


def test_allows_clean_action():
    a = Action(strategy="digital_products", description="list a template pack",
               cost=0.0, legality="clear", tos_compliant=True)
    assert eng().check(a).allowed


def test_blocks_prohibited_strategy_name():
    a = Action(strategy="pump-and-dump", description="buy and shill a coin")
    r = eng().check(a)
    assert not r.allowed
    assert "prohibited" in r.reason


def test_blocks_prohibited_keyword_in_description():
    a = Action(strategy="content_affiliate", description="buy fake reviews for the listing")
    r = eng().check(a)
    assert not r.allowed


def test_blocks_recurring_charge():
    a = Action(strategy="digital_products", description="sign up for design tool",
               recurring=True, obligation_detail="$29/mo subscription")
    r = eng().check(a)
    assert not r.allowed
    assert "obligation" in r.reason


def test_blocks_obligation_keyword():
    a = Action(strategy="digital_products",
               description="purchase monthly plan for hosting", cost=5.0)
    r = eng().check(a)
    assert not r.allowed


def test_blocks_explicit_obligation_flag():
    a = Action(strategy="reselling_research", description="sign vendor contract",
               creates_obligation=True, obligation_detail="12-month contract")
    assert not eng().check(a).allowed


def test_skips_unclear_legality():
    a = Action(strategy="reselling_research", description="resell in grey market",
               legality="unclear")
    r = eng().check(a)
    assert not r.allowed
    assert r.skipped is True


def test_skips_unknown_tos():
    a = Action(strategy="print_on_demand", description="post to platform",
               tos_compliant=None)
    r = eng().check(a)
    assert not r.allowed
    assert r.skipped is True


def test_blocks_tos_violation():
    a = Action(strategy="print_on_demand", description="post to platform",
               tos_compliant=False)
    r = eng().check(a)
    assert not r.allowed
    assert r.skipped is False
