# ECC Commands Reference — Backend Team

## Cursor Slash Commands

| Command | Dùng khi |
|---------|----------|
| `/ecc:plan` | Lập kế hoạch feature/module trước khi code |
| `/ecc:tdd` | Start TDD workflow |
| `/ecc:code-review` | Review code vừa viết |
| `/ecc:security-review` | OWASP security scan |
| `/ecc:verify` | Verify implementation theo plan |
| `/ecc:docs` | Update documentation, Swagger |
| `/ecc:prune` | Xóa dead code |
| `/ecc:go-review` | (không dùng — repo NestJS) |
| `/ecc:database-reviewer` | Review TypeORM queries, migrations |

## Claude Code Slash Commands

```bash
/ecc:plan "mô tả feature"       # Planning agent
/ecc:tdd                         # TDD guide
/ecc:security-review             # Security scan
/ecc:code-review                 # Code quality
/ecc:verify                      # Verification loop
/ecc:docs                        # Documentation
/ecc:sessions                    # Session history
/ecc:resume-session              # Resume session cũ
```

## Multi-Agent (CCG)

```bash
cd be-cryptocurrency-trading-app
npx ccg-workflow
```

Dùng cho refactoring lớn span nhiều modules hoặc architecture decisions.

## Skill Reference

| Skill | Mục đích |
|-------|----------|
| `nestjs-patterns` | Module/service/controller patterns |
| `backend-patterns` | Repository, service layer patterns |
| `api-design` | REST API design, versioning |
| `database-migrations` | TypeORM migration safety |
| `security-review` | OWASP API Top 10 |
| `tdd-workflow` | Test-driven development |
| `documentation-lookup` | NestJS/TypeORM docs via Context7 |

## Quality Checklist (copy vào PR description)

```markdown
## Quality Checklist
- [ ] npm run lint: PASS
- [ ] npx tsc --noEmit: PASS
- [ ] npm test: PASS (coverage >= 80%)
- [ ] No console.log in production code
- [ ] No hardcoded secrets
- [ ] New endpoints have @UseGuards(JwtAuthGuard)
- [ ] New DTOs have class-validator decorators
- [ ] Migration is backward-compatible
- [ ] Sensitive zone changes: risk assessment in docs/risk-*.md
- [ ] VIBE_CODE.md conventions followed
```
