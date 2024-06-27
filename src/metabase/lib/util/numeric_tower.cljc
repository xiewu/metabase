(ns metabase.lib.util.numeric-tower
  "Versions of stuff like [[clojure.core/number]] that work with JavaScript `BigInt`. Not currently supported in
  ClojureScript, see https://ask.clojure.org/index.php/13676/support-for-js-bigint for more details."
  (:refer-clojure :exclude [bigint integer? neg-int? number? pos-int?]))

(defn big-int?
  "Whether something is an instance of a JVM- or JS-specific big integer type."
   [x]
  #?(:clj  (or (instance? java.math.BigInteger x)
               (instance? clojure.lang.BigInt x))
     ;; does `instance?` not work like we'd expect in JavaScript??
     :cljs (isa? (type x) js/BigInt)))

(def ^{:arglists '([x])} bigint
  "JS-friendly version of [[clojure.core/bigint]] (this function is not present in ClojureScript core)."
  #?(:clj  #_{:clj-kondo/ignore [:discouraged-var]} clojure.core/bigint
     :cljs (fn [x]
             (js/BigInt x))))

(def ^{:arglists '([x])} integer?
  "JS-friendly version of [[clojure.core/integer?]]."
  #?(:clj  #_{:clj-kondo/ignore [:discouraged-var]} clojure.core/integer?
     :cljs (fn [x]
             (or (clojure.core/integer? x)
                 (big-int? x)))))

(def ^{:arglists '([x])} number?
  "JS-friendly version of [[clojure.core/number?]]."
  #?(:clj  #_{:clj-kondo/ignore [:discouraged-var]} clojure.core/number?
     :cljs (fn [x]
             (or (clojure.core/number? x)
                 (big-int? x)))))

(def ^{:arglists '([x])} pos-int?
  "JS-friendly version of [[clojure.core/pos-int?]]."
  #?(:clj  #_{:clj-kondo/ignore [:discouraged-var]} clojure.core/pos-int?
     :cljs (fn [x]
             (or (clojure.core/pos-int? x)
                 (big-int? x)))))

(def ^{:arglists '([x])} neg-int?
  "JS-friendly version of [[clojure.core/neg-int?]]."
  #?(:clj  #_{:clj-kondo/ignore [:discouraged-var]} clojure.core/neg-int?
     :cljs (fn [x]
             (or (clojure.core/neg-int? x)
                 (big-int? x)))))
