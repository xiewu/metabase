(ns metabase.lib.schema.literal.js
  (:require
   [metabase.lib.util.numeric-tower :as lib.util.numeric-tower]
   [metabase.util.malli.registry :as mr]))

(mr/def ::big-integer
  [:fn
   {:error/message "Instance of JS BigInt"}
   #'lib.util.numeric-tower/big-int?])
