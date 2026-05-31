from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import config

security = HTTPBearer(auto_error=False)


async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing authorization token")

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            config.JWT_SECRET,
            algorithms=["HS256"],
        )
        return payload
    except JWTError:
        try:
            import httpx

            resp = httpx.get(
                f"{config.SUPABASE_URL}/auth/v1/user",
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass

        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_current_user(payload: dict = Depends(verify_token)) -> dict:
    return {
        "id": payload.get("sub") or payload.get("id"),
        "email": payload.get("email", ""),
        "workspace_id": payload.get("workspace_id", ""),
    }
