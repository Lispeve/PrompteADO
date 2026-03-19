"""
PrompteADO — Insert documentos en Supabase
Tabla: documents | Columnas: content, metadata
Uso: python insert_supabase.py
"""

import json
import os
import urllib.request
import urllib.error

# ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

SUPABASE_URL = "https://orebyrpptlqxeuqqdpax.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_VKBVGdZcTiScgh4bRVujaA_FrAT3gVG"
TABLE = "documents"

# ─── DOCUMENTOS A INSERTAR ────────────────────────────────────────────────────
# Pon los .txt en la misma carpeta que este script, o ajusta las rutas.

DOCUMENTS = [
    {
        "filename": "01_Matriz_Decision_PromptKit.txt",
        "metadata": {
            "source": "01_Matriz_Decision_PromptKit",
            "project": "PrompteADO",
            "type": "matriz_decision_texto",
            "language": "es",
            "description": "Matriz de decisión principal: tarea académica → técnica de prompting → IAs recomendadas (texto)"
        }
    },
    {
        "filename": "02_Matriz_Decision_2_Multimodal_PromptKit.txt",
        "metadata": {
            "source": "02_Matriz_Decision_2_Multimodal_PromptKit",
            "project": "PrompteADO",
            "type": "matriz_decision_multimodal",
            "language": "es",
            "description": "Matriz de decisión multimodal: imágenes, video, audio, música, redes sociales"
        }
    },
    {
        "filename": "03_Guia_Tecnicas_Prompting_Estudiantes.txt",
        "metadata": {
            "source": "03_Guia_Tecnicas_Prompting_Estudiantes",
            "project": "PrompteADO",
            "type": "guia_tecnicas",
            "language": "es",
            "description": "Guía completa de técnicas de prompting: Zero-Shot, CoT, Role, Few-Shot, ToT, Meta, PoT"
        }
    },
    {
        "filename": "04_Reglas_Output_PromptKit.txt",
        "metadata": {
            "source": "04_Reglas_Output_PromptKit",
            "project": "PrompteADO",
            "type": "reglas_output",
            "language": "es",
            "description": "Reglas de formato y comportamiento para las respuestas del sistema PrompteADO"
        }
    },
    {
        "filename": "05_System_Prompt_PrompteADO.txt",
        "metadata": {
            "source": "05_System_Prompt_PrompteADO",
            "project": "PrompteADO",
            "type": "system_prompt",
            "language": "es",
            "description": "System prompt completo de PrompteADO v1.0 con identidad, reglas, técnicas y base de IAs"
        }
    },
]

# ─── FUNCIONES ────────────────────────────────────────────────────────────────

def read_file(filename):
    """Lee el archivo .txt desde la misma carpeta que el script."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    filepath = os.path.join(script_dir, filename)

    if not os.path.exists(filepath):
        raise FileNotFoundError(f"No se encontró el archivo: {filepath}")

    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def insert_document(content, metadata):
    """Inserta un documento en Supabase vía REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{TABLE}"

    payload = json.dumps({
        "content": content,
        "metadata": metadata
    }).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Prefer": "return=minimal"
    }

    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req) as response:
            return response.status
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        raise Exception(f"HTTP {e.code}: {error_body}")


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  PrompteADO — Insert a Supabase")
    print(f"  Tabla: {TABLE}")
    print(f"  URL:   {SUPABASE_URL}")
    print("=" * 60)

    success = 0
    errors = 0

    for doc in DOCUMENTS:
        filename = doc["filename"]
        metadata = doc["metadata"]

        print(f"\n[→] {filename}")

        try:
            content = read_file(filename)
            print(f"    Leído: {len(content):,} caracteres")

            status = insert_document(content, metadata)
            print(f"    Insertado correctamente (HTTP {status})")
            success += 1

        except FileNotFoundError as e:
            print(f"    [ERROR] Archivo no encontrado: {e}")
            errors += 1

        except Exception as e:
            print(f"    [ERROR] {e}")
            errors += 1

    print("\n" + "=" * 60)
    print(f"  Resultado: {success} insertados, {errors} errores")
    print("=" * 60)

    if errors > 0:
        print("\nRevisá los errores arriba. Causas comunes:")
        print("  - La tabla 'documents' no existe en Supabase")
        print("  - Las columnas 'content' o 'metadata' tienen otro nombre")
        print("  - La anon key no tiene permisos de INSERT (revisá RLS)")
        print("  - Los archivos .txt no están en la misma carpeta que el script")


if __name__ == "__main__":
    main()
