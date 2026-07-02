from intelligence.language.provider import get_provider
from intelligence.language.templates import TemplateProvider
from intelligence.language.stub import StubProvider


def test_factory_defaults_to_template():
    p = get_provider({})
    assert p.name == "template"


def test_factory_stub():
    p = get_provider({"language_provider": "stub"})
    assert p.name == "stub"


def test_template_structured_output_has_all_keys():
    p = TemplateProvider()
    schema = {"title": "t", "description": "d", "price": "p"}
    out = p.generate("write a listing about productivity templates", schema)
    assert set(out.keys()) == set(schema.keys())
    assert all(isinstance(v, str) and v for v in out.values())


def test_template_deterministic():
    p = TemplateProvider()
    schema = {"title": "t", "description": "d"}
    a = p.generate("a product about dog training", schema)
    b = p.generate("a product about dog training", schema)
    assert a == b


def test_template_plain_text():
    p = TemplateProvider()
    out = p.generate("write copy about coffee")
    assert isinstance(out, str) and out


def test_stub_records_calls_and_returns_schema():
    p = StubProvider(canned={"title": "X"})
    out = p.generate("anything", {"title": "t", "body": "b"})
    assert out["title"] == "X"
    assert out["body"] == "[stub:body]"
    assert p.calls == ["anything"]


def test_local_provider_refuses_remote_host():
    from intelligence.language.local_llm import LocalLLMProvider
    import pytest
    with pytest.raises(ValueError):
        LocalLLMProvider(host="https://api.openai.com")
    with pytest.raises(ValueError):
        LocalLLMProvider(host="https://api.anthropic.com")
    # local hosts are accepted
    LocalLLMProvider(host="http://localhost:11434")
    LocalLLMProvider(host="http://192.168.1.50:11434")
