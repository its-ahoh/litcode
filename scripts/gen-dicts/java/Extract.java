import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.TypeVariable;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reflects over allowlisted JDK classes and writes gen-dicts raw JSON.
 * Usage: java Extract.java <allowlist-lines-file> <out.raw.json>
 * Each allowlist line: "<fqcn> <receiverName>".
 * Docs come from $JAVA_HOME/lib/src.zip Javadoc first sentences when available.
 */
public class Extract {
    static StringBuilder json = new StringBuilder();
    static boolean first = true;
    static FileSystem srcZip = null;
    static Map<String, String> srcCache = new HashMap<>();

    public static void main(String[] args) throws Exception {
        List<String> lines = Files.readAllLines(Paths.get(args[0]));
        openSrcZip();
        json.append("{\"language\":\"java\",\"entries\":[\n");
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty()) continue;
            String[] parts = line.split("\\s+");
            emitClass(parts[0], parts[1]);
        }
        json.append("\n]}\n");
        Files.writeString(Paths.get(args[1]), json.toString());
        System.out.println("java: done");
    }

    static void openSrcZip() {
        try {
            Path p = Paths.get(System.getProperty("java.home"), "lib", "src.zip");
            if (Files.exists(p)) srcZip = FileSystems.newFileSystem(p, (ClassLoader) null);
            else System.err.println("WARN: no src.zip; docs fall back to signatures");
        } catch (Exception e) {
            System.err.println("WARN: cannot open src.zip; docs fall back to signatures");
        }
    }

    static String classSource(String fqcn) {
        if (srcZip == null) return null;
        return srcCache.computeIfAbsent(fqcn, k -> {
            try {
                Path p = srcZip.getPath("java.base", k.replace('.', '/') + ".java");
                return Files.exists(p) ? Files.readString(p) : null;
            } catch (Exception e) {
                return null;
            }
        });
    }

    static String firstSentence(String raw) {
        String doc = raw.replaceAll("(?m)^\\s*\\*", " ");
        doc = doc.replaceAll("\\{@\\w+\\s+([^}]*)\\}", "$1");
        doc = doc.replaceAll("<[^>]+>", "");
        doc = doc.replaceAll("\\s+", " ").trim();
        int dot = doc.indexOf(". ");
        if (dot >= 0) doc = doc.substring(0, dot);
        if (doc.endsWith(".")) doc = doc.substring(0, doc.length() - 1);
        if (doc.startsWith("@")) return "";
        return doc;
    }

    // Finds the javadoc comment immediately preceding a declaration of `member(`.
    // We can't just do one big lazy regex from the first "/**" in the file: a lazy
    // group1 that's merely required to stop at *some* "*/" with a clean run of
    // non-{;}/ chars after it will happily swallow the class-level doc comment and
    // everything in between, because the *first* javadoc block in the file (the
    // class doc) is also a valid start position. So instead: enumerate javadoc
    // comments one at a time (each bounded to its own nearest "*/"), and for each,
    // check *locally* (within a short window) whether it's immediately followed by
    // a declaration of `member(`.
    static String methodDoc(String fqcn, String member) {
        String src = classSource(fqcn);
        if (src == null) return "";
        Pattern comment = Pattern.compile("/\\*\\*(.*?)\\*/", Pattern.DOTALL);
        Pattern follow = Pattern.compile(
            "\\s*(?:@\\w+[^\\n]*\\n\\s*)*[^;{}/]{0,200}?\\b" + Pattern.quote(member) + "\\s*\\(",
            Pattern.DOTALL);
        Matcher cm = comment.matcher(src);
        while (cm.find()) {
            Matcher fm = follow.matcher(src);
            fm.region(cm.end(), Math.min(src.length(), cm.end() + 400));
            if (fm.lookingAt()) return firstSentence(cm.group(1));
        }
        return "";
    }

    static String classDoc(String fqcn, String simple) {
        String src = classSource(fqcn);
        if (src == null) return "";
        Pattern p = Pattern.compile(
            "/\\*\\*(.*?)\\*/\\s*(?:@\\w+[^\\n]*\\n\\s*)*public\\s+(?:abstract\\s+|final\\s+)?(?:class|interface)\\s+"
                + Pattern.quote(simple) + "\\b",
            Pattern.DOTALL);
        Matcher m = p.matcher(src);
        return m.find() ? firstSentence(m.group(1)) : "";
    }

    static String params(int n) {
        String[] names = {"a", "b", "c"};
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < Math.min(n, 3); i++) {
            if (i > 0) b.append(", ");
            b.append(names[i]);
        }
        return b.toString();
    }

    static void emitClass(String fqcn, String recv) throws Exception {
        Class<?> c = Class.forName(fqcn);
        if (c.isAnnotationPresent(Deprecated.class)) return;
        String simple = c.getSimpleName();
        TypeVariable<?>[] tps = c.getTypeParameters();
        String sig = simple;
        String insert = simple;
        if (tps.length > 0) {
            List<String> names = new ArrayList<>();
            for (TypeVariable<?> tv : tps) names.add(tv.getName());
            sig = simple + "<" + String.join(", ", names) + ">";
            insert = simple + "<" + (tps.length == 1 ? "$0" : "$1, $0") + ">";
        }
        // Doc may be empty; the emitter falls back doc -> signature after dedupe,
        // which keeps doc and the final (lowest-arity) signature consistent.
        entry(simple, "class", fqcn, sig, classDoc(fqcn, simple), null, insert);

        // getMethods() order is unspecified per JVM run; sort for deterministic output.
        List<Method> methods = new ArrayList<>(java.util.Arrays.asList(c.getMethods()));
        methods.sort(java.util.Comparator.comparing(Method::getName)
            .thenComparingInt(Method::getParameterCount)
            .thenComparing(m -> java.util.Arrays.toString(m.getParameterTypes())));
        for (Method m : methods) {
            if (m.isSynthetic() || m.isBridge()) continue;
            if (m.isAnnotationPresent(Deprecated.class)) continue;
            String name = m.getName();
            Class<?> dc = m.getDeclaringClass();
            if (dc == Object.class && !name.equals("toString") && !name.equals("equals")
                && !name.equals("hashCode")) continue;
            boolean isStatic = Modifier.isStatic(m.getModifiers());
            int arity = Math.min(m.getParameterCount(), 3);
            String msig = (isStatic ? simple : recv) + "." + name + "(" + params(m.getParameterCount()) + ")";
            String doc = methodDoc(fqcn, name);
            if (doc.isEmpty() && dc != c) doc = methodDoc(dc.getName(), name);
            entry(name, isStatic ? "function" : "method", fqcn, msig, doc, arity, null);
        }
    }

    static void entry(String label, String kind, String container, String sig,
                      String doc, Integer arity, String insertText) {
        if (!first) json.append(",\n");
        first = false;
        json.append("{\"label\":").append(q(label))
            .append(",\"kind\":").append(q(kind))
            .append(",\"container\":").append(q(container))
            .append(",\"signature\":").append(q(sig))
            .append(",\"doc\":").append(q(doc));
        if (arity != null) json.append(",\"arity\":").append(arity);
        if (insertText != null) json.append(",\"insertText\":").append(q(insertText));
        json.append("}");
    }

    static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            switch (ch) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\t': b.append("\\t"); break;
                case '\r': break;
                default:
                    if (ch < 0x20) b.append(' ');
                    else b.append(ch);
            }
        }
        return b.append('"').toString();
    }
}
