# GitHub repo setup

```bash
cd field-and-ledger
git init
git add -A
git commit -m "chore: scaffold Field & Ledger monorepo (design system + invariants + schema)"
git branch -M main
git remote add origin git@github.com:wpf002/field-ledger.git   # or your URL
git push -u origin main
```

If the remote already has commits:
```bash
git pull --rebase origin main
git push -u origin main
```
