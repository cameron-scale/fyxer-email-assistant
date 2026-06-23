from autonomy import AutonomyController
from guardrails import Action


def spend(cost):
    return Action(strategy="digital_products", description="promo", cost=cost)


def nonspend():
    return Action(strategy="digital_products", description="build asset", cost=0.0)


def test_full_executes_immediately():
    c = AutonomyController("full")
    assert c.decide(spend(50.0)).execute_now
    assert c.decide(nonspend()).execute_now


def test_guarded_small_spend_runs_large_queues():
    c = AutonomyController("guarded", guarded_auto_approve_cap=5.0)
    assert c.decide(spend(4.0)).execute_now          # under cap -> runs
    assert not c.decide(spend(6.0)).execute_now      # over cap -> queue
    assert c.decide(nonspend()).execute_now          # non-spend runs free


def test_review_queues_every_spend():
    c = AutonomyController("review")
    assert not c.decide(spend(1.0)).execute_now
    assert not c.decide(spend(0.5)).execute_now


def test_review_runs_internal_nonspend():
    c = AutonomyController("review")
    # a non-spend, non-external action still runs in review
    a = Action(strategy="x", description="internal think", cost=0.0)
    assert c.decide(a).execute_now


def test_full_at_review_then_full_again():
    c = AutonomyController("review")
    assert not c.decide(spend(10.0)).execute_now
    c.set_level("full")
    assert c.decide(spend(10.0)).execute_now
